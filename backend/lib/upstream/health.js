import { createLimiter, isVariableHost, splitHostPath } from "./util.js";

/**
 * Background upstream health monitor. In memory only: nothing is written to the database.
 */

const DEFAULT_CONCURRENCY = 8;
const FIRST_RUN_DELAY_MS = 15000;

/**
 * @param   {*} value
 * @returns {number|null}  a TCP port, or null when the stored value is not one
 */
const toPort = (value) => {
	const raw = `${value ?? ""}`.trim();
	if (!/^\d{1,5}$/.test(raw)) {
		return null;
	}
	const port = Number.parseInt(raw, 10);
	return port >= 1 && port <= 65535 ? port : null;
};

/**
 * Turns host rows into the list of targets to probe.
 *
 * @param   {object} rows
 * @param   {Array}  [rows.proxyHosts]  enabled, non-deleted proxy hosts
 * @param   {Array}  [rows.streams]     enabled, non-deleted streams
 * @returns {Array<{type: string, id: number, owner_user_id: number, targets: Array}>}
 */
const buildHealthTargets = ({ proxyHosts = [], streams = [] } = {}) => {
	const out = [];

	for (const row of proxyHosts || []) {
		if (!row?.enabled) {
			continue;
		}
		const targets = [];
		const { host } = splitHostPath(row.forward_host);
		const port = toPort(row.forward_port);
		// A variable upstream (`$backend`) is resolved by nginx per request and can't be probed
		if (host && port && !isVariableHost(host)) {
			targets.push({ location_index: null, host, port, scheme: row.forward_scheme });
		}
		(Array.isArray(row.locations) ? row.locations : []).forEach((location, index) => {
			if (!location || location.enabled === false || !location.forward_host || !location.forward_port) {
				return;
			}
			const split = splitHostPath(location.forward_host);
			const locationPort = toPort(location.forward_port);
			if (!split.host || !locationPort || isVariableHost(split.host)) {
				return;
			}
			targets.push({
				location_index: index,
				path: `${location.path ?? ""}`.trim(),
				host: split.host,
				port: locationPort,
				scheme: location.forward_scheme,
			});
		});
		if (targets.length) {
			out.push({ type: "proxy_host", id: row.id, owner_user_id: row.owner_user_id, targets });
		}
	}

	for (const row of streams || []) {
		// Only TCP can be checked with a connect; UDP-only streams are skipped
		if (!row?.enabled || !row.tcp_forwarding || !row.forwarding_host || !row.forwarding_port) {
			continue;
		}
		const { host } = splitHostPath(row.forwarding_host);
		const port = toPort(row.forwarding_port);
		if (!host || !port || isVariableHost(host)) {
			continue;
		}
		out.push({
			type: "stream",
			id: row.id,
			owner_user_id: row.owner_user_id,
			targets: [{ location_index: null, host, port, scheme: null }],
		});
	}

	return out;
};

class HealthMonitor {
	/**
	 * @param {object}   opts
	 * @param {function(): number}  opts.getInterval  seconds, 0 = off (read on every schedule)
	 * @param {function(): boolean} [opts.isEnabled]  extra kill switch (NPM_UPSTREAM_CHECK)
	 * @param {function(): Promise<object>} opts.loadRows   -> {proxyHosts, streams}
	 * @param {function(object): Promise<object>} opts.check  checks one {host, port, scheme}
	 * @param {number}   [opts.concurrency]
	 * @param {object}   [opts.logger]
	 * @param {number}   [opts.firstRunDelayMs]
	 */
	constructor(opts) {
		this.opts = opts;
		this.timer = null;
		this.running = null;
		this.stopped = true;
		this.checkedAt = null;
		/** @type {{proxy_host: Object<string, object>, stream: Object<string, object>}} */
		this.state = { proxy_host: {}, stream: {} };
	}

	get interval() {
		return this.opts.getInterval();
	}

	get enabled() {
		const extra = typeof this.opts.isEnabled === "function" ? this.opts.isEnabled() : true;
		return extra && this.interval > 0;
	}

	start() {
		if (!this.enabled) {
			this.opts.logger?.info("Upstream health monitor is disabled");
			return false;
		}
		this.stopped = false;
		this.schedule(this.opts.firstRunDelayMs ?? FIRST_RUN_DELAY_MS);
		this.opts.logger?.info(`Upstream health monitor started (every ${this.interval}s)`);
		return true;
	}

	stop() {
		this.stopped = true;
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
	}

	schedule(delayMs) {
		if (this.stopped) {
			return;
		}
		this.timer = setTimeout(async () => {
			this.timer = null;
			await this.runOnce();
			if (this.enabled) {
				this.schedule(this.interval * 1000);
			}
		}, delayMs);
		this.timer.unref?.();
	}

	/**
	 * Runs one round. Concurrent calls share the same round.
	 *
	 * @returns {Promise<void>}
	 */
	runOnce() {
		if (!this.running) {
			this.running = this.round()
				.catch((err) => {
					this.opts.logger?.warn(`Upstream health round failed: ${err.message}`);
				})
				.finally(() => {
					this.running = null;
				});
		}
		return this.running;
	}

	async round() {
		const rows = await this.opts.loadRows();
		const hosts = buildHealthTargets(rows);
		const limit = createLimiter(this.opts.concurrency || DEFAULT_CONCURRENCY);
		const probes = new Map();

		// Dedupe identical host:port per round
		const probe = (target) => {
			const key = `${target.host.toLowerCase()}|${target.port}`;
			if (!probes.has(key)) {
				probes.set(
					key,
					limit(() => this.opts.check({ host: target.host, port: target.port, scheme: target.scheme })).catch(
						(err) => ({ ok: false, code: "tcp_unreachable", message: err.message, ms: null }),
					),
				);
			}
			return probes.get(key);
		};

		const next = { proxy_host: {}, stream: {} };
		await Promise.all(
			hosts.map(async (entry) => {
				const targets = await Promise.all(
					entry.targets.map(async (target) => {
						const result = await probe(target);
						const out = {
							location_index: target.location_index,
							host: target.host,
							port: target.port,
							ok: !!result.ok,
							code: result.code,
							message: result.message,
							ms: result.ms ?? null,
						};
						if (target.location_index !== null) {
							out.path = target.path;
						}
						return out;
					}),
				);
				next[entry.type][`${entry.id}`] = {
					checked_at: new Date().toISOString(),
					ok: targets.every((t) => t.ok),
					owner_user_id: entry.owner_user_id,
					targets,
				};
			}),
		);

		this.state = next;
		this.checkedAt = new Date().toISOString();
		this.opts.logger?.debug?.(`Upstream health: ${hosts.length} hosts, ${probes.size} distinct targets checked`);
	}

	/**
	 * Snapshot in API shape, filtered.
	 *
	 * @param   {object}   filter
	 * @param   {function(number, number): boolean|null} filter.proxy_host  (owner id, host id) filter, null = type not visible
	 * @param   {function(number, number): boolean|null} filter.stream
	 * @returns {object}
	 */
	snapshot(filter = {}) {
		const hosts = { proxy_host: {}, stream: {} };
		for (const type of Object.keys(hosts)) {
			const allow = filter[type];
			if (typeof allow !== "function") {
				continue;
			}
			for (const [id, value] of Object.entries(this.state[type] || {})) {
				if (allow(value.owner_user_id, Number(id))) {
					const { owner_user_id: _owner, ...rest } = value;
					hosts[type][id] = rest;
				}
			}
		}
		return {
			enabled: this.enabled,
			interval: this.interval,
			checked_at: this.checkedAt,
			hosts,
		};
	}
}

/**
 * The snapshot filter of one host type, the visibility rules of its list endpoint
 *
 * @param   {Object|boolean} accessData  what access.can("<type>:list") resolved to
 * @param   {number}         userId
 * @param   {Array<number>}  [allowedIds]  hosts shared with the user explicitly (permissions.meta.proxy_host_ids)
 * @returns {function(number, number): boolean}
 */
const visibilityFilter = (accessData, userId, allowedIds = []) => {
	if (accessData === true || accessData?.permission_visibility === "all") {
		return () => true;
	}
	const allowed = new Set((Array.isArray(allowedIds) ? allowedIds : []).map(Number));
	return (ownerId, hostId) => ownerId === userId || allowed.has(Number(hostId));
};

export { buildHealthTargets, HealthMonitor, visibilityFilter };
