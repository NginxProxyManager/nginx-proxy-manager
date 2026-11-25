import errs from "../lib/error.js";
import { global as logger } from "../logger.js";
import deadHostModel from "../models/dead_host.js";
import proxyHostModel from "../models/proxy_host.js";
import redirectionHostModel from "../models/redirection_host.js";
import streamModel from "../models/stream.js";
import settingModel from "../models/setting.js";
import db from "../db.js";
import { BUCKET_SECONDS } from "./traffic/aggregator.js";
import GeoIp from "./traffic/geoip.js";
import { isLocalIp } from "./traffic/ip.js";
import Ingest from "./traffic/ingest.js";
import influxStore from "./traffic/store/influx.js";
import localStore from "./traffic/store/local.js";

const SETTING_ID = "traffic-stats";
const MASK = "********";
const MAX_POINTS = 300;
const HOST_MODELS = {
	proxy: proxyHostModel,
	redirection: redirectionHostModel,
	dead: deadHostModel,
	stream: streamModel,
};

// The permission section that covers each kind of host
const SECTIONS = { proxy: "proxy_hosts", redirection: "redirection_hosts", dead: "dead_hosts", stream: "streams" };

export const DEFAULTS = {
	retention_days: 30,
	range_hours: 24,
	geoip: false,
	influx: { url: "", org: "", bucket: "", token: "" },
};

let ingest = null;
let geoip = null;
let activeStore = localStore;
let labels = new Map();

const influxConfigured = (cfg) => !!(cfg?.url && cfg.org && cfg.bucket && cfg.token);

/**
 * Fills in defaults and clamps values. A masked token means "keep the stored one".
 */
const normalizeMeta = (meta = {}, previous = {}) => {
	const influx = { ...DEFAULTS.influx, ...(meta.influx || {}) };
	for (const k of Object.keys(DEFAULTS.influx)) {
		influx[k] = String(influx[k] ?? "").trim();
	}
	if (influx.token === MASK) {
		influx.token = previous.influx?.token || "";
	}
	if (influx.url && !/^https?:\/\//i.test(influx.url)) {
		throw new errs.ValidationError("InfluxDB URL must start with http:// or https://");
	}
	const clamp = (v, min, max, def) => {
		const n = Number.parseInt(v, 10);
		return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
	};
	return {
		geoip: meta.geoip === true,
		status_codes: meta.status_codes === true,
		retention_days: clamp(meta.retention_days, 1, 3650, DEFAULTS.retention_days),
		range_hours: clamp(meta.range_hours, 1, 24 * 3650, DEFAULTS.range_hours),
		influx,
	};
};

const maskMeta = (meta) => {
	const m = { ...DEFAULTS, ...(meta || {}) };
	m.influx = { ...DEFAULTS.influx, ...(m.influx || {}) };
	if (m.influx.token) {
		m.influx = { ...m.influx, token: MASK };
	}
	return m;
};

const refreshLabels = async () => {
	const next = new Map();
	for (const [type, model] of Object.entries(HOST_MODELS)) {
		const rows = await model.query().where("is_deleted", 0);
		for (const row of rows) {
			next.set(`${type}|${row.id}`, row);
		}
	}
	labels = next;
};

const labelOf = (type, id) => {
	const row = labels.get(`${type}|${id}`);
	if (type === "stream") {
		return row ? `Stream :${row.incoming_port}` : "";
	}
	return Array.isArray(row?.domain_names) && row.domain_names.length ? row.domain_names.join(", ") : "";
};

/**
 * Works out which hosts the user may see statistics for, the same way the host lists do: a host type
 * they have no access to is left out entirely, and with "own hosts only" visibility only their own
 * hosts of a type count.
 *
 * @param   {Access} access
 * @returns {Promise<Array|null>}  null for everything, otherwise {host_type, host_id?} entries
 *                                 (without host_id: every host of that type)
 */
const visibleHosts = async (access) => {
	const userId = access.token.getUserId(1);
	const hosts = [];
	let everything = true;
	for (const [type, section] of Object.entries(SECTIONS)) {
		let accessData;
		try {
			accessData = await access.can(`${section}:list`, 1);
		} catch {
			everything = false;
			continue;
		}
		if (accessData.permission_visibility === "all") {
			hosts.push({ host_type: type });
			continue;
		}
		everything = false;
		for (const [key, row] of labels) {
			const [host_type, id] = key.split("|");
			if (host_type === type && row.owner_user_id === userId) {
				hosts.push({ host_type, host_id: Number(id) });
			}
		}
	}
	return everything ? null : hosts;
};

let applying = Promise.resolve();

/**
 * Where statistics are kept: "local", or the InfluxDB destination (a different URL, organization or
 * bucket is a different place, with its own history to import).
 */
const storageKey = (meta) =>
	influxConfigured(meta.influx) ? `influx|${meta.influx.url}|${meta.influx.org}|${meta.influx.bucket}` : "local";

const applyNow = async (row, previousRow) => {
	const setting = row || (await settingModel.query().where({ id: SETTING_ID }).first());
	if (ingest) {
		// wait for a pass in progress, so the old worker can't touch cursors or counters after this
		await ingest.stop();
		ingest = null;
	}
	geoip?.unload();
	geoip = null;
	if (setting?.value !== "enabled") {
		return;
	}

	const meta = normalizeMeta(setting.meta);
	await refreshLabels();
	activeStore = influxConfigured(meta.influx) ? influxStore(meta.influx, labelOf) : localStore;

	// A different storage destination has none of the history yet: forget where the logs were read
	// up to, so they are imported into it
	if (previousRow && storageKey(normalizeMeta(previousRow.meta)) !== storageKey(meta)) {
		await db()("traffic_stat_cursor").del();
	}

	geoip = meta.geoip ? new GeoIp() : null;
	ingest = new Ingest({
		store: activeStore,
		retentionDays: meta.retention_days,
		geoip,
		statusCodes: meta.status_codes,
	});
	logger.info(`Traffic stats enabled (storage: ${activeStore.type}, retention: ${meta.retention_days} days)`);
	ingest.start();
};

const sumCounts = (rows) => {
	const totals = { requests: 0, s2xx: 0, s3xx: 0, s4xx: 0, s5xx: 0, bytes: 0 };
	for (const row of rows) {
		for (const k of Object.keys(totals)) {
			totals[k] += row[k];
		}
	}
	return totals;
};

const internalTrafficStats = {
	SETTING_ID,
	normalizeMeta,
	maskMeta,
	visibleHosts,

	/**
	 * Starts or stops the ingest worker to match the stored setting.
	 *
	 * @param   {Object|null} row           the setting row, or null to read it
	 * @param   {Object|null} previousRow   the setting row before an update
	 * @returns {Promise}
	 */
	apply: (row = null, previousRow = null) => {
		// one change at a time: saving settings twice quickly must not start two workers
		applying = applying.then(
			() => applyNow(row, previousRow),
			() => applyNow(row, previousRow),
		);
		return applying;
	},

	/**
	 * Reports on traffic over the last `hours` hours.
	 *
	 * @param   {Access} access
	 * @param   {Object} data
	 * @param   {Number} [data.hours]
	 * @param   {String} [data.host_type]  with host_id, only report on this host
	 * @param   {Number} [data.host_id]
	 * @returns {Promise}
	 */
	getReport: async (access, data = {}) => {
		await access.can("reports:traffic", 1);
		const setting = await settingModel.query().where({ id: SETTING_ID }).first();
		if (setting?.value !== "enabled") {
			return { enabled: false };
		}
		const meta = normalizeMeta(setting.meta);
		const hours = Math.min(
			meta.retention_days * 24,
			Math.max(1, Number.parseInt(data.hours, 10) || meta.range_hours),
		);

		await refreshLabels();
		let hosts = await visibleHosts(access);

		if (data.host_type) {
			const host = { host_type: String(data.host_type), host_id: Number.parseInt(data.host_id, 10) };
			if (!(host.host_type in HOST_MODELS) || !Number.isFinite(host.host_id)) {
				throw new errs.ValidationError("Invalid host");
			}
			// a user who may not see this host gets an empty report rather than another host's numbers
			const allowed =
				!hosts ||
				hosts.some(
					(h) => h.host_type === host.host_type && (h.host_id === undefined || h.host_id === host.host_id),
				);
			hosts = allowed ? [host] : [];
		}

		const to = Math.floor(Date.now() / 1000);
		const from = to - hours * 3600;
		const step = Math.max(BUCKET_SECONDS, Math.ceil((to - from) / MAX_POINTS / BUCKET_SECONDS) * BUCKET_SECONDS);

		// the per-code points are hourly, so their chart uses whole hours
		const statusStep = Math.max(3600, Math.ceil(step / 3600) * 3600);

		let result;
		try {
			result = await activeStore.query({ from, to, step, statusStep, hosts, statuses: meta.status_codes });
		} catch (err) {
			logger.error(`Traffic stats query failed: ${err.message}`);
			throw new errs.ValidationError(`Could not read traffic stats: ${err.message}`);
		}

		// The same span just before this one, for the "vs previous period" changes
		let previous = null;
		try {
			const before = await activeStore.query({ from: from - (to - from), to: from, step: to - from, hosts });
			previous = {
				totals: sumCounts(before.hosts),
				hosts: before.hosts.map(({ host_type, host_id, requests, bytes, s4xx, s5xx }) => ({
					host_type,
					host_id,
					requests,
					bytes,
					s4xx,
					s5xx,
				})),
			};
		} catch (err) {
			logger.warn(`Traffic stats: previous period query failed: ${err.message}`);
		}

		const totals = { requests: 0, s2xx: 0, s3xx: 0, s4xx: 0, s5xx: 0, bytes: 0 };
		for (const row of result.hosts) {
			for (const k of Object.keys(totals)) {
				totals[k] += row[k];
			}
			row.label = labelOf(row.host_type, row.host_id) || `Deleted host #${row.host_id}`;
		}
		result.hosts.sort((a, b) => b.requests - a.requests);

		// Tag the top client IPs with a country for the flags: local addresses never need the database
		result.top.ip = result.top.ip.map((row) => ({
			...row,
			country: isLocalIp(row.item) ? "LOCAL" : geoip?.reader ? geoip.country(row.item) || "??" : null,
		}));

		return {
			enabled: true,
			storage: activeStore.type,
			error: ingest?.lastError || geoip?.error || null,
			geoip: !!geoip?.reader,
			statusCodes: meta.status_codes,
			range: { from, to, step, hours },
			statusStep,
			totals,
			previous,
			series: result.series,
			statuses: result.statuses,
			hosts: result.hosts,
			top: result.top,
		};
	},
};

export default internalTrafficStats;
