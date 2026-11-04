import { isValidHost, splitHostPath } from "./util.js";

const MAX_ITEMS = 500;
const SOURCE_PRIORITY = { docker: 0, dns: 1, history: 2 };

const validPort = (value) => {
	const port = Number.parseInt(value, 10);
	return port >= 1 && port <= 65535 ? port : null;
};

/**
 * Builds "history" candidates from rows the user can already see.
 *
 * @param   {object} rows
 * @param   {Array}  [rows.proxyHosts]  proxy_host rows (forward_host, forward_port, forward_scheme, locations)
 * @param   {Array}  [rows.streams]     stream rows (forwarding_host, forwarding_port)
 * @returns {Array<object>}
 */
const buildHistoryCandidates = ({ proxyHosts = [], streams = [] } = {}) => {
	/** @type {Map<string, {host: string, ports: Set<number>, schemes: Map<string, number>, users: Set<string>}>} */
	const map = new Map();

	const add = (rawHost, rawPort, scheme, usageKey) => {
		const { host } = splitHostPath(rawHost);
		if (!isValidHost(host)) {
			return;
		}
		const key = host.toLowerCase();
		let entry = map.get(key);
		if (!entry) {
			entry = { host, ports: new Set(), schemes: new Map(), users: new Set() };
			map.set(key, entry);
		}
		const port = validPort(rawPort);
		if (port) {
			entry.ports.add(port);
		}
		if (scheme === "http" || scheme === "https") {
			entry.schemes.set(scheme, (entry.schemes.get(scheme) || 0) + 1);
		}
		entry.users.add(usageKey);
	};

	for (const row of proxyHosts || []) {
		if (!row) {
			continue;
		}
		const usage = `proxy_host:${row.id}`;
		add(row.forward_host, row.forward_port, row.forward_scheme, usage);
		for (const location of Array.isArray(row.locations) ? row.locations : []) {
			if (location?.forward_host) {
				add(location.forward_host, location.forward_port, location.forward_scheme, usage);
			}
		}
	}

	for (const row of streams || []) {
		if (row?.forwarding_host) {
			add(row.forwarding_host, row.forwarding_port, null, `stream:${row.id}`);
		}
	}

	return [...map.values()].map((entry) => {
		const ports = [...entry.ports].sort((a, b) => a - b);
		let hintScheme = null;
		if (entry.schemes.size === 1) {
			hintScheme = [...entry.schemes.keys()][0];
		}
		return {
			host: entry.host,
			label: `${entry.host} (used by ${entry.users.size} host${entry.users.size === 1 ? "" : "s"})`,
			source: "history",
			ports,
			hint_port: ports.length === 1 ? ports[0] : null,
			hint_scheme: hintScheme,
			network: null,
			state: null,
			ip: null,
			used_by: entry.users.size,
		};
	});
};

/**
 * Merges candidates from all providers and dedupes them by host (case-insensitive).
 * Priority docker > dns > history: the best source wins for label/source/network/state/ip, ports are
 * unioned, hints fall back to lower-priority sources, used_by is kept from history.
 *
 * @param   {Array<Array<object>>} lists
 * @param   {number} [max]
 * @returns {Array<object>}
 */
const mergeCandidates = (lists, max = MAX_ITEMS) => {
	const all = lists
		.flat()
		.filter((item) => item && typeof item.host === "string" && item.host !== "")
		.sort((a, b) => (SOURCE_PRIORITY[a.source] ?? 9) - (SOURCE_PRIORITY[b.source] ?? 9));

	const merged = new Map();
	for (const item of all) {
		const key = item.host.toLowerCase();
		const existing = merged.get(key);
		if (!existing) {
			merged.set(key, {
				host: item.host,
				label: item.label || item.host,
				source: item.source,
				ports: [...(item.ports || [])],
				hint_port: item.hint_port ?? null,
				hint_scheme: item.hint_scheme ?? null,
				network: item.network ?? null,
				state: item.state ?? null,
				ip: item.ip ?? null,
				used_by: item.used_by || 0,
			});
			continue;
		}
		existing.ports = [...new Set([...existing.ports, ...(item.ports || [])])].sort((a, b) => a - b);
		existing.hint_port = existing.hint_port ?? item.hint_port ?? null;
		existing.hint_scheme = existing.hint_scheme ?? item.hint_scheme ?? null;
		existing.network = existing.network ?? item.network ?? null;
		existing.state = existing.state ?? item.state ?? null;
		existing.ip = existing.ip ?? item.ip ?? null;
		existing.used_by = Math.max(existing.used_by, item.used_by || 0);
	}

	const items = [...merged.values()];
	items.sort((a, b) => {
		const bySource = (SOURCE_PRIORITY[a.source] ?? 9) - (SOURCE_PRIORITY[b.source] ?? 9);
		if (bySource !== 0) {
			return bySource;
		}
		if (a.source === "history" && b.used_by !== a.used_by) {
			return b.used_by - a.used_by;
		}
		return a.host.localeCompare(b.host);
	});
	return items.slice(0, max);
};

export { buildHistoryCandidates, MAX_ITEMS, mergeCandidates };
