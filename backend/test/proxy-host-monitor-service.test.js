import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

const testRoot = await mkdtemp(path.join(os.tmpdir(), "npm-monitor-service-test-"));
process.env.NPM_KEYS_FILE = path.join(testRoot, "keys.json");
process.env.DB_SQLITE_FILE = path.join(testRoot, "database.sqlite");
process.env.NODE_CONFIG_DIR = path.join(testRoot, "config");
const monitorLog = path.join(testRoot, "monitor.log");
process.env.PROXY_HOST_MONITOR_LOG_PATH = monitorLog;

const monitorModule = await import("../internal/proxy-host-monitor.js");
const { default: db } = await import("../db.js");
const {
	ProxyHostMonitor,
	bodyMatches,
	directProbe,
	histogramQuantile,
	httpRequest,
	mergeMetric,
	mergeMetricRows,
	normalizeExpectedStatuses,
	normalizeMonitorConfig,
	probeTargets,
	statusExpected,
	summarizeMetrics,
	toCursor,
	unavailableUpstream,
} = monitorModule;
const [{ default: ProxyHost }, { default: ProxyHostMonitorConfig }, { default: ProxyHostMonitorState }] = await Promise.all([
	import("../models/proxy_host.js"),
	import("../models/proxy_host_monitor_config.js"),
	import("../models/proxy_host_monitor_state.js"),
]);

after(async () => {
	await db().destroy();
});

test("monitor config normalization accepts supported values and rejects malformed policies", () => {
	const config = normalizeMonitorConfig({
		probe_mode: "both",
		interval_seconds: 90.4,
		timeout_ms: 1200,
		http_method: "head",
		path: "/health",
		expected_statuses: ["200", "300-399"],
		degraded5xx_ratio: 2,
		degraded_p95_ms: 0,
		body_match_type: "contains",
		body_match_value: "ready",
		ignored_field: "ignored",
	});
	assert.equal(config.probe_mode, "both");
	assert.equal(config.http_method, "HEAD");
	assert.equal(config.interval_seconds, 90);
	assert.equal(config.degraded_5xx_ratio, 1);
	assert.equal(config.degraded_p95_ms, 1);
	assert.equal(config.ignored_field, undefined);

	assert.throws(() => normalizeMonitorConfig({ probe_mode: "icmp" }), /probe_mode/);
	assert.throws(() => normalizeMonitorConfig({ interval_seconds: 15, timeout_ms: 15000 }), /timeout_ms/);
	assert.throws(() => normalizeMonitorConfig({ http_method: "POST" }), /GET or HEAD/);
	assert.throws(() => normalizeMonitorConfig({ path: "health" }), /relative path/);
	assert.throws(() => normalizeMonitorConfig({ path: "/bad\npath" }), /relative path/);
	assert.throws(() => normalizeMonitorConfig({ expected_statuses: [] }), /between 1 and 20/);
	assert.throws(() => normalizeMonitorConfig({ expected_statuses: ["ok"] }), /Invalid expected/);
	assert.throws(() => normalizeMonitorConfig({ expected_statuses: ["99-200"] }), /Invalid expected/);
	assert.throws(() => normalizeMonitorConfig({ body_match_type: "json" }), /body_match_type/);
	assert.throws(() => normalizeMonitorConfig({ body_match_type: "contains" }), /body_match_value/);
	assert.throws(() => normalizeMonitorConfig({ body_match_type: "regex", body_match_value: "[" }));
});

test("monitor metric helpers aggregate passive and synthetic events", () => {
	const first = mergeMetric(null, {
		ts: "2026-09-05T01:02:03.000Z",
		status: "503",
		bytes_sent: "100",
		body_bytes_sent: "80",
		request_length: "40",
		request_time: "0.025",
		upstream_connect_time: "0.002,0.004",
		upstream_header_time: "0.010",
		upstream_response_time: "0.020",
		upstream_status: "502,503",
	});
	assert.equal(first.counters.requests, 1);
	assert.equal(first.counters.server_errors, 1);
	assert.equal(first.counters.gateway_errors, 1);
	assert.equal(first.counters.upstream_errors, 2);
	assert.deepEqual(first.histograms.request_time_ms, [25]);

	const second = mergeMetric(first, { synthetic: "1", status: 200, ts: "2026-09-05T01:03:00.000Z" });
	assert.equal(second.counters.synthetic_requests, 1);
	assert.equal(second.counters.requests, 1);
	assert.equal(second.gauges.last_status, 200);

	const merged = mergeMetricRows([
		{ counters: JSON.stringify(first.counters), histograms: JSON.stringify(first.histograms), gauges: JSON.stringify(first.gauges) },
		{ counters: second.counters, histograms: second.histograms, gauges: second.gauges },
		{ counters: "bad json", histograms: null, gauges: null },
	]);
	assert.equal(merged.counters.requests, 2);
	assert.equal(merged.gauges.last_status, 200);
	const summary = summarizeMetrics([{ counters: second.counters, histograms: second.histograms, gauges: second.gauges }]);
	assert.equal(summary.error_ratio, 1);
	assert.equal(summary.p95_request_time_ms, 25);
	assert.equal(summarizeMetrics([]).error_ratio, 0);
});

test("monitor ranges, body matching, quantiles and cursors cover boundary behavior", () => {
	assert.deepEqual(normalizeExpectedStatuses(undefined), ["200-399"]);
	assert.deepEqual(normalizeExpectedStatuses(["204", "500-599"]), ["204", "500-599"]);
	assert.equal(statusExpected(204, ["200-299"]), true);
	assert.equal(statusExpected(404, ["200-299"]), false);
	assert.equal(histogramQuantile([], 0.95), null);
	assert.equal(histogramQuantile([30, 10, 20], 0.5), 20);
	assert.equal(bodyMatches("service ready", { body_match_type: null }), true);
	assert.equal(bodyMatches("service ready", { body_match_type: "contains", body_match_value: "ready" }), true);
	assert.equal(bodyMatches("service ready", { body_match_type: "contains", body_match_value: "down" }), false);
	assert.equal(bodyMatches("service ready", { body_match_type: "regex", body_match_value: "service\\s+ready" }), true);
	const cursor = toCursor({ dev: 2, ino: 3 }, 10, "partial", "2026-09-05T00:00:00Z");
	assert.equal(cursor.device_id, "2:3");
	assert.equal(cursor.offset, 10);
	assert.equal(toCursor({}, 0, "").partial_line, null);
});

test("effective monitoring status applies active state and passive degradation rules", () => {
	const monitor = new ProxyHostMonitor();
	const base = normalizeMonitorConfig({ degraded_min_requests: 2, degraded_5xx_ratio: 0.5, degraded_gateway_error_count: 2, degraded_p95_ms: 100 });
	assert.deepEqual(monitor.computeEffectiveStatus(null, { ...base, enabled: false }, {}), { status: "disabled", reason: "monitor_disabled" });
	assert.deepEqual(monitor.computeEffectiveStatus({ status: "invalid" }, base, {}), { status: "unknown", reason: null });
	assert.equal(monitor.computeEffectiveStatus({ status: "online" }, base, { requests: 2, error_ratio: 0.5, gateway_errors: 0, p95_request_time_ms: 0 }).reason, "passive_5xx_ratio");
	assert.equal(monitor.computeEffectiveStatus({ status: "online" }, base, { requests: 2, error_ratio: 0, gateway_errors: 2, p95_request_time_ms: 0 }).reason, "passive_gateway_errors");
	assert.equal(monitor.computeEffectiveStatus({ status: "online" }, base, { requests: 2, error_ratio: 0, gateway_errors: 0, p95_request_time_ms: 100 }).reason, "passive_p95_latency");
	assert.deepEqual(monitor.computeEffectiveStatus({ status: "offline", status_reason: "probe_failed" }, base, { requests: 100 }), { status: "offline", reason: "probe_failed" });
	monitor.timer = setInterval(() => {}, 1000);
	monitor.probes.add(Promise.resolve());
	monitor.passiveConfigCache.set(1, { enabled: true });
	monitor.stop();
	assert.equal(monitor.timer, null);
	assert.equal(monitor.probes.size, 0);
});

test("monitor configuration lifecycle creates, caches and patches persisted settings", async () => {
	const originals = { configQuery: ProxyHostMonitorConfig.query, stateQuery: ProxyHostMonitorState.query };
	let stored = null;
	const patches = [];
	ProxyHostMonitorConfig.query = () => ({
		findOne: async () => stored,
		insertAndFetch: async (data) => { stored = { id: 8, ...data }; return stored; },
		findById: () => ({ patch: async (data) => { patches.push(data); stored = { ...stored, ...data }; } }),
	});
	ProxyHostMonitorState.query = () => ({ findById: async (id) => ({ proxy_host_id: id, status: "online" }) });
	try {
		const monitor = new ProxyHostMonitor();
		assert.equal((await monitor.ensureConfig(7)).proxy_host_id, 7);
		assert.equal(await monitor.passiveCollectionEnabled(7), true);
		assert.equal(await monitor.passiveCollectionEnabled(7), true);
		assert.equal(monitor.passiveConfigCache.size, 1);
		const updated = await monitor.updateConfig(7, { active_enabled: false, passive_desired_enabled: false });
		assert.equal(updated.active_enabled, false);
		assert.equal(patches[0].passive_applied_enabled, false);
		assert.equal(patches[0].passive_last_error.code, "PASSIVE_MONITOR_DISABLED");
		assert.equal((await monitor.getState(7)).status, "online");
	} finally {
		ProxyHostMonitorConfig.query = originals.configQuery;
		ProxyHostMonitorState.query = originals.stateQuery;
	}
});

test("monitor scheduler synchronizes hosts, selects due probes and prevents duplicate probes", async () => {
	const originals = { hostQuery: ProxyHost.query, configQuery: ProxyHostMonitorConfig.query };
	ProxyHost.query = () => ({
		select: () => ({ where: async () => [{ id: 1 }, { id: 2 }] }),
		findById: async (id) => id === 3 ? null : { id, enabled: 1, is_deleted: 0 },
	});
	ProxyHostMonitorConfig.query = () => ({ where: async () => [
		{ proxy_host_id: 1, interval_seconds: 60 },
		{ proxy_host_id: 2, interval_seconds: 60 },
	] });
	try {
		const monitor = new ProxyHostMonitor();
		const ensured = [];
		monitor.ensureConfig = async (id) => { ensured.push(id); return { proxy_host_id: id }; };
		await monitor.syncProxyHostConfigs();
		await monitor.syncProxyHostConfigs();
		assert.deepEqual(ensured, [1, 2]);

		monitor.getState = async (id) => id === 1 ? null : { last_checked_on: new Date().toISOString() };
		const probed = [];
		monitor.probe = async (id) => probed.push(id);
		await monitor.runDueProbes();
		assert.deepEqual(probed, [1]);

		const realProbe = ProxyHostMonitor.prototype.probe.bind(monitor);
		monitor.probe = realProbe;
		monitor.persistProbe = async (id, config, result, host) => ({ id, config, result, host });
		const disabled = await monitor.probe(3, { enabled: true });
		assert.equal(disabled.result.code, "disabled");
		monitor.probes.add(4);
		monitor.getState = async () => ({ status: "busy" });
		assert.deepEqual(await monitor.probe(4), { status: "busy" });
	} finally {
		ProxyHost.query = originals.hostQuery;
		ProxyHostMonitorConfig.query = originals.configQuery;
	}
});

test("monitor tick serializes work and probe persistence maintains thresholds", async () => {
	const originalStateQuery = ProxyHostMonitorState.query;
	const patches = [];
	ProxyHostMonitorState.query = () => ({
		findById: () => ({ patch: async (record) => patches.push(record) }),
		insert: async (record) => patches.push(record),
	});
	try {
		const monitor = new ProxyHostMonitor();
		const calls = [];
		monitor.syncProxyHostConfigs = async () => calls.push("sync");
		monitor.ingest = async () => calls.push("ingest");
		monitor.runDueProbes = async () => calls.push("probe");
		monitor.rollupAndRetain = async () => calls.push("rollup");
		await monitor.tick();
		assert.deepEqual(calls, ["sync", "ingest", "probe", "rollup"]);
		monitor.inFlight = true;
		await monitor.tick();
		assert.equal(calls.length, 4);

		const previous = { status: "online", consecutive_successes: 2, consecutive_failures: 0, status_changed_on: "old" };
		monitor.getState = async () => previous;
		await monitor.persistProbe(7, { enabled: true, success_threshold: 2, failure_threshold: 2, probe_mode: "tcp" }, { success: true, duration_ms: 4.4, http_status: 200 }, { enabled: true, nginx_deployment_status: "online" });
		assert.equal(patches[0].status, "online");
		assert.equal(patches[0].consecutive_successes, 3);

		monitor.getState = async () => ({ status: "degraded", consecutive_successes: 0, consecutive_failures: 0, status_changed_on: "old" });
		await monitor.persistProbe(7, { enabled: true, success_threshold: 2, failure_threshold: 2, probe_mode: "tcp" }, { success: false, code: "timeout", summary: "timed\nout", duration_ms: 7 }, { enabled: true, nginx_deployment_status: "online" });
		assert.equal(patches[1].status, "degraded");
		assert.equal(patches[1].last_failure_summary, "timed out");
	} finally {
		ProxyHostMonitorState.query = originalStateQuery;
	}
});

test("monitor log ingestion handles missing files, valid events, invalid lines and partial records", async () => {
	await db().schema.createTable("monitor_ingestion_cursor", (table) => {
		table.string("source_id").primary();
		table.string("device_id");
		table.integer("offset");
		table.text("partial_line");
		table.string("last_event_timestamp");
		table.integer("schema_version");
		table.string("updated_on");
	});
	for (const name of ["proxy_host_metric_minute", "proxy_host_metric_hour"]) {
		await db().schema.createTable(name, (table) => {
			table.increments("id").primary();
			table.integer("proxy_host_id");
			table.string("bucket_start");
			table.integer("schema_version");
			table.text("counters");
			table.text("histograms");
			table.text("gauges");
			table.string("created_on");
			table.string("modified_on");
			table.unique(["proxy_host_id", "bucket_start"]);
		});
	}
	await db().schema.createTable("proxy_host_monitor_event", (table) => {
		table.increments("id").primary();
		table.integer("proxy_host_id");
		table.string("occurred_on");
		table.string("event_type");
		table.string("from_status");
		table.string("to_status");
		table.string("reason_code");
		table.string("summary");
		table.text("details");
	});
	const monitor = new ProxyHostMonitor();
	const events = [];
	const cursors = [];
	monitor.recordLogEvent = async (event) => events.push(event);
	monitor.saveCursor = async (cursor) => cursors.push(cursor);
	await rm(monitorLog, { force: true });
	assert.deepEqual(await monitor.ingest(), { read: 0, ingested: 0 });
	process.env.PROXY_HOST_MONITOR_INGEST_FROM_START = "true";
	try {
		const valid = JSON.stringify({ v: 1, host_type: "proxy_host", host_id: "7", status: 200, ts: "2026-09-05T00:00:00Z" });
		const ignored = JSON.stringify({ v: 2, host_type: "proxy_host", host_id: 8 });
		await writeFile(monitorLog, `${valid}\nnot-json\n${ignored}\npartial`, "utf8");
		const result = await monitor.ingest();
		assert.equal(result.ingested, 1);
		assert.equal(events[0].host_id, 7);
		assert.equal(cursors.at(-1).partial_line, "partial");
		assert.ok(result.read > 0);
	} finally {
		delete process.env.PROXY_HOST_MONITOR_INGEST_FROM_START;
	}
});

test("monitor persistence builds snapshots, series, list status and hourly rollups", async () => {
	const originals = { configQuery: ProxyHostMonitorConfig.query, stateQuery: ProxyHostMonitorState.query };
	const monitor = new ProxyHostMonitor();
	const config = normalizeMonitorConfig({ degraded_min_requests: 1, degraded_5xx_ratio: 0.5 });
	monitor.passiveCollectionEnabled = async () => true;
	try {
		await monitor.saveCursor(toCursor({ dev: 1, ino: 2 }, 4, "part"));
		await monitor.saveCursor(toCursor({ dev: 1, ino: 2 }, 8, ""));
		assert.equal(Number((await db()("monitor_ingestion_cursor").first()).offset), 8);

		await monitor.recordLogEvent({ host_id: 7, ts: "2026-09-05T01:02:03Z", status: 200, request_time: "0.01" });
		await monitor.recordLogEvent({ host_id: 7, ts: "2026-09-05T01:02:30Z", status: 503, request_time: "0.03" });
		assert.equal((await db()("proxy_host_metric_minute")).length, 1);

		monitor.ensureConfig = async () => config;
		monitor.getState = async () => ({ status: "online", status_reason: null, last_checked_on: "2026-09-05" });
		const snapshot = await monitor.snapshot(7, { from: "2026-09-05T01:00:00Z", to: "2026-09-05T01:05:00Z" });
		assert.equal(snapshot.summary.requests, 2);
		assert.equal(snapshot.state.status, "degraded");
		const series = await monitor.timeseries(7, { from: "2026-09-05T01:00:00Z", to: "2026-09-05T01:05:00Z" });
		assert.equal(series.length, 1);

		ProxyHostMonitorConfig.query = () => ({ whereIn: async () => [{ proxy_host_id: 7, ...config }] });
		ProxyHostMonitorState.query = () => ({ whereIn: async () => [{ proxy_host_id: 7, status: "online", last_checked_on: "now" }] });
		const statuses = await monitor.listStatuses([{ id: 7, enabled: 1 }, { id: 8, enabled: 0 }, { id: "bad", enabled: 1 }]);
		assert.equal(statuses.get(7).status, "online");
		assert.equal(statuses.get(8).status, "disabled");
		assert.equal((await monitor.listStatuses([])).size, 0);

		const currentHour = new Date();
		currentHour.setUTCMinutes(0, 0, 0);
		const prior = new Date(currentHour.getTime() - 30 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);
		await db()("proxy_host_metric_minute").insert({
			proxy_host_id: 9, bucket_start: prior, schema_version: 1,
			counters: JSON.stringify({ requests: 1 }), histograms: JSON.stringify({ request_time_ms: [10] }), gauges: JSON.stringify({ last_status: 200 }),
			created_on: prior, modified_on: prior,
		});
		await monitor.rollupAndRetain();
		assert.ok((await db()("proxy_host_metric_hour")).length >= 1);
	} finally {
		ProxyHostMonitorConfig.query = originals.configQuery;
		ProxyHostMonitorState.query = originals.stateQuery;
	}
});

test("monitor TCP and HTTP probes exercise success, failure, redirect and body policies", async () => {
	const tcpServer = net.createServer((socket) => socket.end());
	await new Promise((resolve) => tcpServer.listen(0, "127.0.0.1", resolve));
	const tcpPort = tcpServer.address().port;
	const webServer = http.createServer((request, response) => {
		if (request.url === "/redirect") {
			response.writeHead(302, { location: "/health" });
			response.end();
			return;
		}
		if (request.url === "/bad") {
			response.writeHead(503);
			response.end("down");
			return;
		}
		response.writeHead(200);
		response.end("service ready");
	});
	await new Promise((resolve) => webServer.listen(0, "127.0.0.1", resolve));
	const webPort = webServer.address().port;
	const config = normalizeMonitorConfig({ interval_seconds: 60, timeout_ms: 1000, probe_mode: "http", path: "/health", body_match_type: "contains", body_match_value: "ready" });
	try {
		const tcp = await directProbe({ host: "127.0.0.1", port: tcpPort }, "http", { ...config, probe_mode: "tcp" });
		assert.equal(tcp.success, true);
		const httpResult = await directProbe({ host: "127.0.0.1", port: webPort }, "http", config);
		assert.equal(httpResult.success, true);
		assert.equal(httpResult.http_status, 200);
		const redirected = await httpRequest({ protocol: "http:", host: "127.0.0.1", port: webPort, servername: "example.test", headers: {}, config: { ...config, path: "/redirect", follow_redirects: true } });
		assert.equal(redirected.success, true);
		const bad = await httpRequest({ protocol: "http:", host: "127.0.0.1", port: webPort, servername: "example.test", headers: {}, config: { ...config, path: "/bad" } });
		assert.equal(bad.success, false);
		assert.equal(bad.http_status, 503);
		const grouped = await probeTargets([{ host: "127.0.0.1", port: 1 }, { host: "127.0.0.1", port: tcpPort }], "http", { ...config, probe_mode: "tcp", timeout_ms: 200 });
		assert.equal(grouped.success, true);
		assert.deepEqual(unavailableUpstream("none"), { success: false, code: "unavailable", summary: "none", duration_ms: 0 });
		assert.equal((await probeTargets([], "http", { ...config, probe_mode: "tcp" })).code, "unavailable");
	} finally {
		await Promise.all([
			new Promise((resolve) => tcpServer.close(resolve)),
			new Promise((resolve) => webServer.close(resolve)),
		]);
	}
});
