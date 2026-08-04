import assert from "node:assert/strict";
import test from "node:test";
import { normalizeEventTimestamp } from "../../internal/proxy-host-monitor-timestamp.js";

test("MON-003 normalizes Nginx $msec timestamps to ISO dates", () => {
	assert.equal(normalizeEventTimestamp("1704067200.123").toISOString(), "2024-01-01T00:00:00.123Z");
	assert.equal(normalizeEventTimestamp("1704067200123").toISOString(), "2024-01-01T00:00:00.123Z");
});

test("MON-004 falls back when a monitoring event timestamp is missing or invalid", () => {
	const fallback = new Date("2024-01-01T00:00:00.000Z");
	assert.equal(normalizeEventTimestamp(undefined, fallback), fallback);
	assert.equal(normalizeEventTimestamp("not-a-date", fallback), fallback);
});
