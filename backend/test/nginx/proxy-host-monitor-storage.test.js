import assert from "node:assert/strict";
import test from "node:test";
import { databaseJson, databaseMetric } from "../../internal/proxy-host-monitor-storage.js";

test("MON-001 serializes direct-Knex monitoring metric JSON fields", () => {
	const record = databaseMetric({
		counters: { requests: 2 },
		histograms: { request_time_ms: [9, 7] },
		gauges: { last_status: 403 },
		schema_version: 1,
	});

	assert.equal(typeof record.counters, "string");
	assert.equal(typeof record.histograms, "string");
	assert.equal(typeof record.gauges, "string");
	assert.deepEqual(JSON.parse(record.counters), { requests: 2 });
	assert.deepEqual(JSON.parse(record.histograms), { request_time_ms: [9, 7] });
	assert.deepEqual(JSON.parse(record.gauges), { last_status: 403 });
	assert.equal(record.schema_version, 1);
});

test("MON-002 serializes direct-Knex event details and null values", () => {
	assert.equal(databaseJson({ mode: "tcp", duration_ms: 3 }), '{"mode":"tcp","duration_ms":3}');
	assert.equal(databaseJson(null), "null");
});
