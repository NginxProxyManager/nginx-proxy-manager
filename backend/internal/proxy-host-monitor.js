import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import db from "../db.js";
import { global as logger } from "../logger.js";
import now from "../models/now_helper.js";
import ProxyHost from "../models/proxy_host.js";
import ProxyHostMonitorConfig from "../models/proxy_host_monitor_config.js";
import ProxyHostMonitorState from "../models/proxy_host_monitor_state.js";
import { databaseJson, databaseMetric } from "./proxy-host-monitor-storage.js";
import { normalizeEventTimestamp } from "./proxy-host-monitor-timestamp.js";

const SOURCE_ID = "npm-monitor-http-v1";
const LOG_PATH = process.env.PROXY_HOST_MONITOR_LOG_PATH || "/data/logs/npm-monitor-http.log";
const TICK_MS = Number.parseInt(process.env.PROXY_HOST_MONITOR_TICK_MS || "5000", 10);
const MAX_INGEST_BYTES = Math.max(64 * 1024, Number.parseInt(process.env.PROXY_HOST_MONITOR_MAX_INGEST_BYTES || "4194304", 10));
const MAX_PROBES = Math.max(1, Number.parseInt(process.env.PROXY_HOST_MONITOR_MAX_CONCURRENCY || "10", 10));
const RETENTION_DAYS = Math.max(1, Number.parseInt(process.env.PROXY_HOST_MONITOR_RETENTION_DAYS || "30", 10));
const enabledByEnvironment = process.env.PROXY_HOST_MONITORING !== "false";
const passiveByEnvironment = process.env.PROXY_HOST_MONITOR_PASSIVE !== "false";
const activeByEnvironment = process.env.PROXY_HOST_MONITOR_ACTIVE !== "false";

const DEFAULT_CONFIG = Object.freeze({
	enabled: true,
	passive_desired_enabled: true,
	passive_applied_enabled: false,
	active_enabled: true,
	probe_mode: "tcp",
	interval_seconds: 60,
	timeout_ms: 5000,
	http_method: "GET",
	path: "/",
	expected_statuses: ["200-399"],
	follow_redirects: false,
	tls_verify: true,
	body_match_type: null,
	body_match_value: null,
	failure_threshold: 3,
	success_threshold: 2,
	degraded_5xx_ratio: 0.1,
	degraded_gateway_error_count: 5,
	degraded_min_requests: 20,
	degraded_p95_ms: null,
});

const CONFIG_FIELDS = Object.freeze(Object.keys(DEFAULT_CONFIG));
const STATUS = new Set(["disabled", "unknown", "online", "degraded", "offline", "config_error"]);
const PROBE_MODES = new Set(["tcp", "tls", "http", "end_to_end", "both"]);
const HTTP_METHODS = new Set(["GET", "HEAD"]);
const DATE = (value = new Date()) => {
	const date = value instanceof Date ? value : new Date(value);
	return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")} ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}:${String(date.getUTCSeconds()).padStart(2, "0")}`;
};
// Objection models accept Knex raw expressions from `now()`, but direct Knex
// writes bind values through better-sqlite3. Use a concrete timestamp there so
// SQLite receives a supported primitive rather than a raw-expression object.
const databaseTimestamp = () => DATE();
const minuteBucket = (value) => {
	const date = new Date(value);
	date.setUTCSeconds(0, 0);
	return DATE(date);
};
const hourBucket = (value) => {
	const date = new Date(value);
	date.setUTCMinutes(0, 0, 0);
	return DATE(date);
};
const parseJson = (value, fallback = {}) => {
	if (value === null || typeof value === "undefined") return fallback;
	if (typeof value === "object") return value;
	try {
		return JSON.parse(value);
	} catch {
		return fallback;
	}
};
const asNumber = (value, fallback = 0) => {
	const number = Number(value);
	return Number.isFinite(number) ? number : fallback;
};
const clamp = (value, minimum, maximum, fallback) => {
	const number = asNumber(value, fallback);
	return Math.min(maximum, Math.max(minimum, Math.round(number)));
};
const bool = (value, fallback) => (typeof value === "undefined" ? fallback : Boolean(value));
const trimSummary = (value) => String(value || "").replace(/[\r\n\t]+/g, " ").slice(0, 512);

const emptyCounters = () => ({
	requests: 0,
	synthetic_requests: 0,
	client_errors: 0,
	server_errors: 0,
	gateway_errors: 0,
	bytes_sent: 0,
	body_bytes_sent: 0,
	request_length: 0,
	upstream_attempts: 0,
	upstream_errors: 0,
});
const emptyHistograms = () => ({
	request_time_ms: [],
	upstream_connect_time_ms: [],
	upstream_header_time_ms: [],
	upstream_response_time_ms: [],
});
const emptyGauges = () => ({ last_status: null, last_event_at: null });

const configValues = (source = {}) => Object.fromEntries(
	CONFIG_FIELDS.filter((field) => typeof source[field] !== "undefined").map((field) => [field, source[field]]),
);

export const normalizeMonitorConfig = (input = {}, current = DEFAULT_CONFIG) => {
	// The frontend request transport decamelizes `degraded5xxRatio` as
	// `degraded5xx_ratio`, because it cannot infer the numeric acronym boundary.
	// Accept that legacy transport spelling, but never let non-config fields reach
	// an Objection patch (for example id, proxy_host_id, or state fields).
	const patch = { ...input };
	if (typeof patch.degraded_5xx_ratio === "undefined" && typeof patch.degraded5xx_ratio !== "undefined") {
		patch.degraded_5xx_ratio = patch.degraded5xx_ratio;
	}
	const value = { ...DEFAULT_CONFIG, ...configValues(current), ...configValues(patch) };
	if (!PROBE_MODES.has(value.probe_mode)) throw new Error("Invalid monitor probe_mode");
	value.interval_seconds = clamp(value.interval_seconds, 15, 3600, DEFAULT_CONFIG.interval_seconds);
	value.timeout_ms = clamp(value.timeout_ms, 500, 30000, DEFAULT_CONFIG.timeout_ms);
	if (value.timeout_ms >= value.interval_seconds * 1000)
		throw new Error("Monitor timeout_ms must be lower than interval_seconds");
	value.http_method = String(value.http_method || "GET").toUpperCase();
	if (!HTTP_METHODS.has(value.http_method)) throw new Error("Monitor http_method must be GET or HEAD");
	value.path = String(value.path || "/");
	if (!value.path.startsWith("/") || value.path.includes("\r") || value.path.includes("\n") || value.path.length > 2048)
		throw new Error("Monitor path must be a relative path");
	value.expected_statuses = normalizeExpectedStatuses(value.expected_statuses);
	value.failure_threshold = clamp(value.failure_threshold, 1, 20, DEFAULT_CONFIG.failure_threshold);
	value.success_threshold = clamp(value.success_threshold, 1, 20, DEFAULT_CONFIG.success_threshold);
	value.degraded_5xx_ratio = Math.min(1, Math.max(0, asNumber(value.degraded_5xx_ratio, DEFAULT_CONFIG.degraded_5xx_ratio)));
	value.degraded_gateway_error_count = clamp(value.degraded_gateway_error_count, 1, 100000, DEFAULT_CONFIG.degraded_gateway_error_count);
	value.degraded_min_requests = clamp(value.degraded_min_requests, 1, 1000000, DEFAULT_CONFIG.degraded_min_requests);
	value.degraded_p95_ms = value.degraded_p95_ms == null ? null : clamp(value.degraded_p95_ms, 1, 300000, null);
	value.enabled = bool(value.enabled, true);
	value.passive_desired_enabled = bool(value.passive_desired_enabled, true);
	value.active_enabled = bool(value.active_enabled, true);
	value.follow_redirects = bool(value.follow_redirects, false);
	value.tls_verify = bool(value.tls_verify, true);
	value.body_match_type = value.body_match_type == null ? null : String(value.body_match_type);
	if (value.body_match_type && !["contains", "regex"].includes(value.body_match_type)) throw new Error("Invalid body_match_type");
	value.body_match_value = value.body_match_value == null ? null : String(value.body_match_value).slice(0, 512);
	if (value.body_match_type && !value.body_match_value) throw new Error("body_match_value is required when body_match_type is set");
	if (value.body_match_type === "regex") new RegExp(value.body_match_value);
	return configValues(value);
};

const normalizeExpectedStatuses = (input) => {
	const values = Array.isArray(input) ? input : DEFAULT_CONFIG.expected_statuses;
	if (!values.length || values.length > 20) throw new Error("expected_statuses must contain between 1 and 20 ranges");
	return values.map((value) => {
		const match = String(value).match(/^(\d{3})(?:-(\d{3}))?$/);
		if (!match) throw new Error("Invalid expected status range");
		const start = Number(match[1]);
		const end = Number(match[2] || match[1]);
		if (start < 100 || end > 599 || start > end) throw new Error("Invalid expected status range");
		return start === end ? `${start}` : `${start}-${end}`;
	});
};

const statusExpected = (status, expected) => expected.some((range) => {
	const [start, end = start] = range.split("-").map(Number);
	return status >= start && status <= end;
});

const histogramQuantile = (values, quantile) => {
	if (!values?.length) return null;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))];
};

const mergeMetric = (metric, event) => {
	const counters = { ...emptyCounters(), ...parseJson(metric?.counters, {}) };
	const histograms = { ...emptyHistograms(), ...parseJson(metric?.histograms, {}) };
	const gauges = { ...emptyGauges(), ...parseJson(metric?.gauges, {}) };
	const isSynthetic = event.synthetic === "1" || event.synthetic === 1 || event.synthetic === true;
	if (isSynthetic) counters.synthetic_requests += 1;
	else {
		counters.requests += 1;
		counters.bytes_sent += Math.max(0, asNumber(event.bytes_sent));
		counters.body_bytes_sent += Math.max(0, asNumber(event.body_bytes_sent));
		counters.request_length += Math.max(0, asNumber(event.request_length));
		const status = asNumber(event.status);
		if (status >= 400 && status < 500) counters.client_errors += 1;
		if (status >= 500) counters.server_errors += 1;
		if ([502, 503, 504].includes(status)) counters.gateway_errors += 1;
		for (const [field, source] of Object.entries({
			request_time_ms: event.request_time,
			upstream_connect_time_ms: event.upstream_connect_time,
			upstream_header_time_ms: event.upstream_header_time,
			upstream_response_time_ms: event.upstream_response_time,
		})) {
			const duration = asNumber(String(source || "").split(",").at(-1), -1);
			if (duration >= 0) histograms[field] = [...histograms[field].slice(-499), Math.round(duration * 1000)];
		}
		const upstreamStatuses = String(event.upstream_status || "").split(",").filter(Boolean);
		counters.upstream_attempts += upstreamStatuses.length;
		counters.upstream_errors += upstreamStatuses.filter((value) => asNumber(value) >= 500 || asNumber(value) === 0).length;
	}
	gauges.last_status = asNumber(event.status, null);
	gauges.last_event_at = event.ts || null;
	return { counters, histograms, gauges };
};

const mergeMetricRows = (rows) => {
	const counters = emptyCounters();
	const histograms = emptyHistograms();
	const gauges = emptyGauges();
	for (const row of rows) {
		const rowCounters = parseJson(row.counters, {});
		for (const key of Object.keys(counters)) counters[key] += asNumber(rowCounters[key]);
		const rowHistograms = parseJson(row.histograms, {});
		for (const key of Object.keys(histograms)) histograms[key].push(...(rowHistograms[key] || []));
		const rowGauges = parseJson(row.gauges, {});
		if (rowGauges.last_event_at && (!gauges.last_event_at || rowGauges.last_event_at > gauges.last_event_at)) {
			gauges.last_event_at = rowGauges.last_event_at;
			gauges.last_status = rowGauges.last_status;
		}
	}
	for (const key of Object.keys(histograms)) histograms[key] = histograms[key].slice(-5000);
	return { counters, histograms, gauges };
};

const summarizeMetrics = (rows) => {
	const result = { ...emptyCounters(), p95_request_time_ms: null, last_status: null, last_event_at: null };
	const metric = mergeMetricRows(rows);
	Object.assign(result, metric.counters);
	result.last_status = metric.gauges.last_status;
	result.last_event_at = metric.gauges.last_event_at;
	result.error_ratio = result.requests ? result.server_errors / result.requests : 0;
	result.p95_request_time_ms = histogramQuantile(metric.histograms.request_time_ms, 0.95);
	return result;
};

const toCursor = (stat, offset, partialLine, lastEventTimestamp = null) => ({
	device_id: `${stat.dev ?? ""}:${stat.ino ?? ""}`,
	offset,
	partial_line: partialLine || null,
	last_event_timestamp: lastEventTimestamp,
	schema_version: 1,
	updated_on: databaseTimestamp(),
});

class ProxyHostMonitor {
	constructor() {
		this.timer = null;
		this.running = false;
		this.inFlight = false;
		this.probes = new Set();
		this.passiveConfigCache = new Map();
		this.lastRollupHour = null;
		this.nextConfigSyncAt = 0;
	}

	async ensureConfig(proxyHostId) {
		let config = await ProxyHostMonitorConfig.query().findOne("proxy_host_id", proxyHostId);
		if (!config) {
			try {
				config = await ProxyHostMonitorConfig.query().insertAndFetch({
					proxy_host_id: proxyHostId,
					...DEFAULT_CONFIG,
					passive_applied_enabled: passiveByEnvironment,
					passive_checked_on: now(),
				});
			} catch {
				config = await ProxyHostMonitorConfig.query().findOne("proxy_host_id", proxyHostId);
			}
		}
		return config;
	}

	async passiveCollectionEnabled(proxyHostId) {
		const cached = this.passiveConfigCache.get(proxyHostId);
		if (cached && cached.expiresAt > Date.now()) return cached.enabled;
		const config = await this.ensureConfig(proxyHostId);
		const enabled = Boolean(config?.enabled && config?.passive_desired_enabled && passiveByEnvironment);
		this.passiveConfigCache.set(proxyHostId, { enabled, expiresAt: Date.now() + 30_000 });
		return enabled;
	}

	async updateConfig(proxyHostId, patch) {
		const current = await this.ensureConfig(proxyHostId);
		const config = normalizeMonitorConfig(patch, current);
		const passiveApplied = passiveByEnvironment && config.passive_desired_enabled;
		await ProxyHostMonitorConfig.query().findById(current.id).patch({
			...config,
			passive_applied_enabled: passiveApplied,
			passive_checked_on: now(),
			passive_last_error: passiveApplied ? null : { code: "PASSIVE_MONITOR_DISABLED", message: "Passive ingestion is disabled by environment or config" },
		});
		this.passiveConfigCache.delete(proxyHostId);
		return this.ensureConfig(proxyHostId);
	}

	async getState(proxyHostId) {
		return await ProxyHostMonitorState.query().findById(proxyHostId);
	}

	async snapshot(proxyHostId, { from, to } = {}) {
		const config = await this.ensureConfig(proxyHostId);
		const state = await this.getState(proxyHostId);
		const end = to ? new Date(to) : new Date();
		const start = from ? new Date(from) : new Date(end.getTime() - 5 * 60 * 1000);
		const rows = await db()("proxy_host_metric_minute")
			.where("proxy_host_id", proxyHostId)
			.whereBetween("bucket_start", [DATE(start), DATE(end)])
			.orderBy("bucket_start", "asc");
		const summary = summarizeMetrics(rows);
		const effective = this.computeEffectiveStatus(state, config, summary);
		return {
			config,
			state: { ...state, status: effective.status, status_reason: effective.reason },
			summary,
			worker: { enabled: enabledByEnvironment, passive_enabled: passiveByEnvironment, active_enabled: activeByEnvironment, log_path: LOG_PATH },
		};
	}

	/**
	 * Return the effective monitoring status for a set of list rows without
	 * creating monitor configuration records. This keeps the proxy-host list to
	 * three batched queries while using the same active/passive status rules as
	 * the monitoring detail view.
	 */
	async listStatuses(hosts) {
		const hostIds = [...new Set(hosts.map((host) => Number(host.id)).filter(Number.isSafeInteger))];
		if (!hostIds.length) return new Map();
		const start = DATE(new Date(Date.now() - 5 * 60 * 1000));
		const [configs, states, metrics] = await Promise.all([
			ProxyHostMonitorConfig.query().whereIn("proxy_host_id", hostIds),
			ProxyHostMonitorState.query().whereIn("proxy_host_id", hostIds),
			db()("proxy_host_metric_minute").whereIn("proxy_host_id", hostIds).where("bucket_start", ">=", start),
		]);
		const configByHostId = new Map(configs.map((config) => [config.proxy_host_id, config]));
		const stateByHostId = new Map(states.map((state) => [state.proxy_host_id, state]));
		const metricsByHostId = new Map();
		for (const metric of metrics) {
			const rows = metricsByHostId.get(metric.proxy_host_id) || [];
			rows.push(metric);
			metricsByHostId.set(metric.proxy_host_id, rows);
		}
		return new Map(hosts.map((host) => {
			const config = configByHostId.get(host.id) || DEFAULT_CONFIG;
			const state = stateByHostId.get(host.id) || null;
			const effective = host.enabled
				? this.computeEffectiveStatus(state, config, summarizeMetrics(metricsByHostId.get(host.id) || []))
				: { status: "disabled", reason: "proxy_host_disabled" };
			return [host.id, {
				status: effective.status,
				status_reason: effective.reason,
				last_checked_on: state?.last_checked_on || null,
				status_changed_on: state?.status_changed_on || null,
			}];
		}));
	}

	async timeseries(proxyHostId, { from, to, resolution = "minute" } = {}) {
		const table = resolution === "hour" ? "proxy_host_metric_hour" : "proxy_host_metric_minute";
		const end = to ? new Date(to) : new Date();
		const start = from ? new Date(from) : new Date(end.getTime() - 60 * 60 * 1000);
		const rows = await db()(table)
			.where("proxy_host_id", proxyHostId)
			.whereBetween("bucket_start", [DATE(start), DATE(end)])
			.orderBy("bucket_start", "asc");
		return rows.map((row) => ({
			bucket_start: row.bucket_start,
			...summarizeMetrics([row]),
		}));
	}

	computeEffectiveStatus(state, config, summary) {
		if (!config.enabled) return { status: "disabled", reason: "monitor_disabled" };
		let status = STATUS.has(state?.status) ? state.status : "unknown";
		let reason = state?.status_reason || null;
		if (status === "online" && summary.requests >= config.degraded_min_requests) {
			if (summary.error_ratio >= config.degraded_5xx_ratio) ({ status, reason } = { status: "degraded", reason: "passive_5xx_ratio" });
			else if (summary.gateway_errors >= config.degraded_gateway_error_count)
				({ status, reason } = { status: "degraded", reason: "passive_gateway_errors" });
			else if (config.degraded_p95_ms && summary.p95_request_time_ms >= config.degraded_p95_ms)
				({ status, reason } = { status: "degraded", reason: "passive_p95_latency" });
		}
		return { status, reason };
	}

	async start() {
		if (this.timer || !enabledByEnvironment) return;
		await this.tick();
		this.timer = setInterval(() => this.tick().catch((error) => logger.error(`Proxy host monitor tick failed: ${error.message}`)), TICK_MS);
		this.timer.unref?.();
		logger.info(`Proxy host monitoring started (log: ${LOG_PATH})`);
	}

	stop() {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
		this.probes.clear();
		this.passiveConfigCache.clear();
	}

	async tick() {
		if (this.inFlight || !enabledByEnvironment) return;
		this.inFlight = true;
		try {
			await this.syncProxyHostConfigs();
			if (passiveByEnvironment) await this.ingest();
			if (activeByEnvironment) await this.runDueProbes();
			await this.rollupAndRetain();
		} finally {
			this.inFlight = false;
		}
	}

	async ingest() {
		let stat;
		try {
			stat = await fs.stat(LOG_PATH);
		} catch (error) {
			if (error.code !== "ENOENT") logger.warn(`Unable to stat proxy monitoring log: ${error.message}`);
			return { read: 0, ingested: 0 };
		}
		const cursor = await db()("monitor_ingestion_cursor").where("source_id", SOURCE_ID).first();
		const deviceId = `${stat.dev ?? ""}:${stat.ino ?? ""}`;
		const firstRead = !cursor;
		let offset = cursor ? Number(cursor.offset) : process.env.PROXY_HOST_MONITOR_INGEST_FROM_START === "true" ? 0 : stat.size;
		let partial = cursor?.partial_line || "";
		if (cursor && (cursor.device_id !== deviceId || stat.size < offset)) {
			offset = 0;
			partial = "";
		}
		if (offset >= stat.size) {
			await this.saveCursor(toCursor(stat, stat.size, partial, cursor?.last_event_timestamp));
			return { read: 0, ingested: 0, first_read: firstRead };
		}
		const bytes = Math.min(MAX_INGEST_BYTES, stat.size - offset);
		const handle = await fs.open(LOG_PATH, "r");
		let raw;
		try {
			const buffer = Buffer.alloc(bytes);
			const result = await handle.read(buffer, 0, bytes, offset);
			raw = buffer.subarray(0, result.bytesRead).toString("utf8");
		} finally {
			await handle.close();
		}
		const lines = `${partial}${raw}`.split("\n");
		const nextPartial = lines.pop() || "";
		let ingested = 0;
		let lastTimestamp = cursor?.last_event_timestamp || null;
		for (const line of lines) {
			if (!line.trim()) continue;
			try {
				const event = JSON.parse(line);
				if (event.v !== 1 || event.host_type !== "proxy_host" || !Number.isSafeInteger(Number(event.host_id))) continue;
				await this.recordLogEvent({ ...event, host_id: Number(event.host_id) });
				ingested += 1;
				lastTimestamp = event.ts || lastTimestamp;
			} catch (error) {
				logger.warn(`Ignoring invalid proxy monitoring log line: ${error.message}`);
			}
		}
		await this.saveCursor(toCursor(stat, offset + Buffer.byteLength(raw), nextPartial, lastTimestamp));
		return { read: Buffer.byteLength(raw), ingested, first_read: firstRead };
	}

	async saveCursor(data) {
		const query = db()("monitor_ingestion_cursor");
		const existing = await query.where("source_id", SOURCE_ID).first();
		if (existing) await query.where("source_id", SOURCE_ID).update(data);
		else await query.insert({ source_id: SOURCE_ID, ...data });
	}

	async recordLogEvent(event) {
		if (!(await this.passiveCollectionEnabled(event.host_id))) return;
		const timestamp = normalizeEventTimestamp(event.ts);
		const normalizedEvent = { ...event, ts: timestamp.toISOString() };
		const bucketStart = minuteBucket(timestamp);
		await db().transaction(async (trx) => {
			const existing = await trx("proxy_host_metric_minute")
				.where({ proxy_host_id: event.host_id, bucket_start: bucketStart })
				.first();
			const values = mergeMetric(existing, normalizedEvent);
			const record = databaseMetric({ ...values, schema_version: 1, modified_on: databaseTimestamp() });
			if (existing) await trx("proxy_host_metric_minute").where("id", existing.id).update(record);
			else await trx("proxy_host_metric_minute").insert({ proxy_host_id: event.host_id, bucket_start: bucketStart, ...record, created_on: databaseTimestamp() });
		});
	}

	async syncProxyHostConfigs() {
		if (Date.now() < this.nextConfigSyncAt) return;
		this.nextConfigSyncAt = Date.now() + 60_000;
		const hosts = await ProxyHost.query().select("id").where({ enabled: 1, is_deleted: 0 });
		for (let index = 0; index < hosts.length; index += 25) {
			await Promise.all(hosts.slice(index, index + 25).map((host) => this.ensureConfig(host.id)));
		}
	}

	async runDueProbes() {
		const configs = await ProxyHostMonitorConfig.query().where({ enabled: 1, active_enabled: 1 });
		const due = [];
		const current = Date.now();
		for (const config of configs) {
			const state = await this.getState(config.proxy_host_id);
			if (this.probes.has(config.proxy_host_id)) continue;
			if (!state?.last_checked_on || current - new Date(state.last_checked_on).getTime() >= config.interval_seconds * 1000) due.push(config);
		}
		for (let index = 0; index < due.length; index += MAX_PROBES) {
			await Promise.all(due.slice(index, index + MAX_PROBES).map((config) => this.probe(config.proxy_host_id, config).catch((error) => logger.warn(`Probe ${config.proxy_host_id} failed: ${error.message}`))));
		}
	}

	async probe(proxyHostId, config = null) {
		if (this.probes.has(proxyHostId)) return this.getState(proxyHostId);
		this.probes.add(proxyHostId);
		try {
			const host = await ProxyHost.query().findById(proxyHostId);
			if (!host || host.is_deleted || !host.enabled) return await this.persistProbe(proxyHostId, config || (await this.ensureConfig(proxyHostId)), { success: false, code: "disabled", summary: "Proxy host is disabled" }, host);
			const actualConfig = config || (await this.ensureConfig(proxyHostId));
			const result = await runProbe(host, actualConfig);
			return await this.persistProbe(proxyHostId, actualConfig, result, host);
		} finally {
			this.probes.delete(proxyHostId);
		}
	}

	async persistProbe(proxyHostId, config, result, host) {
		const previous = await this.getState(proxyHostId);
		const oldStatus = previous?.status || "unknown";
		const checkedAt = now();
		let status = oldStatus;
		let reason = result.code || null;
		let successes = previous?.consecutive_successes || 0;
		let failures = previous?.consecutive_failures || 0;
		if (!config.enabled || !host?.enabled) {
			status = "disabled";
			successes = 0;
			failures = 0;
		} else if (host?.nginx_deployment_status === "error") {
			status = "config_error";
		} else if (result.success) {
			successes += 1;
			failures = 0;
			if (successes >= config.success_threshold) status = "online";
			else if (status === "offline") status = "unknown";
		} else {
			failures += 1;
			successes = 0;
			status = failures >= config.failure_threshold ? "offline" : "degraded";
		}
		const record = {
			status,
			status_reason: reason,
			status_changed_on: status !== oldStatus ? checkedAt : previous?.status_changed_on || checkedAt,
			last_checked_on: checkedAt,
			last_success_on: result.success ? checkedAt : previous?.last_success_on || null,
			last_failure_on: result.success ? previous?.last_failure_on || null : checkedAt,
			consecutive_successes: successes,
			consecutive_failures: failures,
			last_probe_duration_ms: Math.round(result.duration_ms || 0),
			last_http_status: result.http_status || null,
			last_failure_code: result.success ? null : result.code || "internal",
			last_failure_summary: result.success ? null : trimSummary(result.summary),
			worker_seen_on: checkedAt,
			updated_on: checkedAt,
		};
		if (previous) await ProxyHostMonitorState.query().findById(proxyHostId).patch(record);
		else await ProxyHostMonitorState.query().insert({ proxy_host_id: proxyHostId, ...record });
		if (status !== oldStatus) {
			await db()("proxy_host_monitor_event").insert({
				proxy_host_id: proxyHostId,
				// Direct Knex writes cannot bind Objection's raw `now()` expression.
				occurred_on: databaseTimestamp(),
				event_type: "status_changed",
				from_status: oldStatus,
				to_status: status,
				reason_code: reason,
				summary: result.success ? "Probe recovered" : trimSummary(result.summary),
				details: databaseJson({ mode: config.probe_mode, duration_ms: Math.round(result.duration_ms || 0), http_status: result.http_status || null }),
			});
		}
		return this.getState(proxyHostId);
	}

	async rollupAndRetain() {
		const currentHour = hourBucket(new Date());
		if (this.lastRollupHour !== currentHour) {
			this.lastRollupHour = currentHour;
			const end = new Date(currentHour.replace(" ", "T") + "Z");
			const start = new Date(end.getTime() - 2 * 60 * 60 * 1000);
			const rows = await db()("proxy_host_metric_minute")
				.whereBetween("bucket_start", [DATE(start), DATE(new Date(end.getTime() - 1))])
				.orderBy("bucket_start", "asc");
			const groups = new Map();
			for (const row of rows) {
				const key = `${row.proxy_host_id}:${hourBucket(row.bucket_start)}`;
				const group = groups.get(key) || { proxy_host_id: row.proxy_host_id, bucket_start: hourBucket(row.bucket_start), rows: [] };
				group.rows.push(row);
				groups.set(key, group);
			}
			for (const group of groups.values()) {
				const metric = mergeMetricRows(group.rows);
				const record = databaseMetric({ ...metric, schema_version: 1, modified_on: databaseTimestamp() });
				const existing = await db()("proxy_host_metric_hour").where({ proxy_host_id: group.proxy_host_id, bucket_start: group.bucket_start }).first();
				if (existing) await db()("proxy_host_metric_hour").where("id", existing.id).update(record);
				else await db()("proxy_host_metric_hour").insert({ proxy_host_id: group.proxy_host_id, bucket_start: group.bucket_start, ...record, created_on: databaseTimestamp() });
			}
		}
		const minuteCutoff = DATE(new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000));
		const hourRetentionDays = Math.max(RETENTION_DAYS, Number.parseInt(process.env.PROXY_HOST_MONITOR_HOUR_RETENTION_DAYS || "180", 10));
		const hourCutoff = DATE(new Date(Date.now() - hourRetentionDays * 24 * 60 * 60 * 1000));
		await Promise.all([
			db()("proxy_host_metric_minute").where("bucket_start", "<", minuteCutoff).del(),
			db()("proxy_host_metric_hour").where("bucket_start", "<", hourCutoff).del(),
		]);
	}
}

const tcpConnect = ({ host, port, timeout }) => new Promise((resolve) => {
	const started = performance.now();
	const socket = net.connect({ host, port });
	const finish = (result) => {
		socket.destroy();
		resolve({ ...result, duration_ms: performance.now() - started });
	};
	socket.setTimeout(timeout, () => finish({ success: false, code: "timeout", summary: "TCP connection timed out" }));
	socket.once("connect", () => finish({ success: true }));
	socket.once("error", (error) => finish({ success: false, code: "connect", summary: error.message }));
});

const tlsConnect = ({ host, port, timeout, verify }) => new Promise((resolve) => {
	const started = performance.now();
	const socket = tls.connect({ host, port, servername: net.isIP(host) ? undefined : host, rejectUnauthorized: verify });
	const finish = (result) => {
		socket.destroy();
		resolve({ ...result, duration_ms: performance.now() - started });
	};
	socket.setTimeout(timeout, () => finish({ success: false, code: "timeout", summary: "TLS handshake timed out" }));
	socket.once("secureConnect", () => finish({ success: true, tls_days_remaining: socket.getPeerCertificate()?.valid_to ? Math.floor((new Date(socket.getPeerCertificate().valid_to).getTime() - Date.now()) / 86400000) : null }));
	socket.once("error", (error) => finish({ success: false, code: "tls", summary: error.message }));
});

const httpRequest = ({ protocol, host, port, servername, headers, config, path = config.path, redirectsRemaining = 3 }) => new Promise((resolve) => {
	const started = performance.now();
	const client = protocol === "https:" ? https : http;
	let settled = false;
	const finish = (result) => {
		if (settled) return;
		settled = true;
		resolve({ ...result, duration_ms: performance.now() - started });
	};
	const request = client.request({
		protocol,
		host,
		port,
		path,
		method: config.http_method,
		headers: { "X-NPM-Monitor": "1", ...headers },
		servername,
		rejectUnauthorized: config.tls_verify,
		timeout: config.timeout_ms,
	}, (response) => {
		const status = response.statusCode || 0;
		const location = response.headers.location;
		if (config.follow_redirects && [301, 302, 303, 307, 308].includes(status) && location) {
			if (redirectsRemaining <= 0) {
				response.resume();
				finish({ success: false, http_status: status, code: "redirect_limit", summary: "HTTP redirect limit exceeded" });
				return;
			}
			let target;
			try {
				target = new URL(location, `${protocol}//${host}:${port}${path}`);
			} catch {
				response.resume();
				finish({ success: false, http_status: status, code: "redirect", summary: "Invalid HTTP redirect location" });
				return;
			}
			const targetPort = target.port || (target.protocol === "https:" ? "443" : "80");
			if (target.protocol !== protocol || target.hostname.toLowerCase() !== String(host).toLowerCase() || targetPort !== String(port)) {
				response.resume();
				finish({ success: false, http_status: status, code: "redirect_external", summary: "Refused redirect outside the monitored endpoint" });
				return;
			}
			response.resume();
			httpRequest({ protocol, host, port, servername, headers, config, path: `${target.pathname}${target.search}`, redirectsRemaining: redirectsRemaining - 1 }).then(finish);
			return;
		}
		const chunks = [];
		let size = 0;
		response.on("data", (chunk) => {
			if (size < 16 * 1024) {
				chunks.push(chunk);
				size += chunk.length;
			}
		});
		response.on("end", () => {
			const body = Buffer.concat(chunks).toString("utf8");
			const matched = bodyMatches(body, config);
			const success = statusExpected(status, config.expected_statuses) && matched;
			finish({ success, http_status: status, code: success ? null : matched ? "status" : "body", summary: success ? null : `Unexpected HTTP response ${status}` });
		});
	});
	request.once("timeout", () => request.destroy(new Error("HTTP request timed out")));
	request.once("error", (error) => finish({ success: false, code: error.message.includes("timed out") ? "timeout" : "http", summary: error.message }));
	request.end();
});

const bodyMatches = (body, config) => {
	if (!config.body_match_type) return true;
	return config.body_match_type === "contains" ? body.includes(config.body_match_value) : new RegExp(config.body_match_value).test(body);
};

const runProbe = async (host, config) => {
	const direct = { host: host.forward_host, port: host.forward_port, timeout: config.timeout_ms };
	if (config.probe_mode === "tcp") return tcpConnect(direct);
	if (config.probe_mode === "tls") return tlsConnect({ ...direct, verify: config.tls_verify });
	if (config.probe_mode === "http") return httpRequest({ protocol: host.forward_scheme === "https" ? "https:" : "http:", host: direct.host, port: direct.port, servername: direct.host, headers: { Host: direct.host }, config });
	const domain = host.domain_names?.[0] || host.forward_host;
	const e2e = () => httpRequest({
		protocol: host.ssl_forced || host.certificate_id > 0 ? "https:" : "http:",
		host: "127.0.0.1",
		port: host.ssl_forced || host.certificate_id > 0 ? 443 : 80,
		servername: domain,
		headers: { Host: domain },
		config,
	});
	if (config.probe_mode === "end_to_end") return e2e();
	const [directResult, e2eResult] = await Promise.all([
		httpRequest({ protocol: host.forward_scheme === "https" ? "https:" : "http:", host: direct.host, port: direct.port, servername: direct.host, headers: { Host: direct.host }, config }),
		e2e(),
	]);
	return {
		success: directResult.success && e2eResult.success,
		http_status: e2eResult.http_status || directResult.http_status,
		duration_ms: directResult.duration_ms + e2eResult.duration_ms,
		code: !directResult.success ? `upstream_${directResult.code}` : !e2eResult.success ? `end_to_end_${e2eResult.code}` : null,
		summary: !directResult.success ? directResult.summary : e2eResult.summary,
	};
};

const proxyHostMonitor = new ProxyHostMonitor();
export default proxyHostMonitor;
