import assert from "node:assert/strict";
import { test } from "node:test";
import Aggregator from "./aggregator.js";
import { isLocalIp } from "./ip.js";
import { parseFileName, parseLine, parseTime } from "./parser.js";

const proxyLine =
	'[25/Oct/2026:10:11:12 +0100] - 200 502 - POST https app.example.com "/api/x?y=1" [Client 203.0.113.9] [Length 1234] [Gzip -] [Sent-to 10.0.0.2] "Mozilla/5.0" "-"';
const standardLine =
	'[25/Oct/2026:10:11:12 +0000] 301 - GET http old.example.com "/" [Client 198.51.100.1] [Length 162] [Gzip -] "curl" "-"';

test("parseTime applies the timezone offset", () => {
	assert.equal(parseTime("25/Oct/2026:10:11:12 +0100"), Date.UTC(2026, 9, 25, 9, 11, 12) / 1000);
	assert.equal(parseTime("garbage"), null);
});

test("parses the proxy log format", () => {
	const rec = parseLine(proxyLine);
	assert.equal(rec.status, 502);
	assert.equal(rec.method, "POST");
	assert.equal(rec.host, "app.example.com");
	assert.equal(rec.path, "/api/x");
	assert.equal(rec.ip, "203.0.113.9");
	assert.equal(rec.bytes, 1234);
});

test("parses the standard log format", () => {
	const rec = parseLine(standardLine);
	assert.equal(rec.status, 301);
	assert.equal(rec.ip, "198.51.100.1");
	assert.equal(rec.bytes, 162);
});

test("parses the stream log format", () => {
	const line =
		"[25/Oct/2026:10:11:12 +0000] [Client 203.0.113.9:51234] TCP 200 1500 300 0.512 [Sent-to 10.0.0.5:22] [Sent 1500] [Received 300] [Time 0.001] - -";
	const rec = parseLine(line, "stream");
	assert.equal(rec.status, 200);
	assert.equal(rec.ip, "203.0.113.9");
	assert.equal(rec.bytes, 1500);
	assert.equal(rec.path, "");
	assert.equal(parseLine(line, "proxy"), null);
	const v6 = line.replace("203.0.113.9:51234", "2001:db8::1:51234");
	assert.equal(parseLine(v6, "stream").ip, "2001:db8::1");
});

test("ignores lines it does not understand", () => {
	assert.equal(parseLine("not a log line"), null);
	assert.equal(parseLine(""), null);
});

test("maps log file names to hosts", () => {
	assert.deepEqual(parseFileName("proxy-host-12_access.log"), { host_type: "proxy", host_id: 12 });
	assert.deepEqual(parseFileName("dead-host-3_access.log"), { host_type: "dead", host_id: 3 });
	assert.equal(parseFileName("proxy-host-12_error.log"), null);
	assert.deepEqual(parseFileName("stream-1_access.log"), { host_type: "stream", host_id: 1 });
	assert.equal(parseFileName("../proxy-host-1_access.log"), null);
});

test("aggregates into 5 minute buckets by status class", () => {
	const agg = new Aggregator();
	const host = { host_type: "proxy", host_id: 1 };
	agg.add(host, parseLine(proxyLine));
	agg.add(host, parseLine(proxyLine.replace(" 502 ", " 200 ").replace(" - 200 200 ", " - 200 200 ")));
	const { buckets, tops } = agg.drain();
	assert.equal(buckets.length, 1);
	assert.equal(buckets[0].requests, 2);
	assert.equal(buckets[0].bytes, 2468);
	assert.ok(tops.some((t) => t.kind === "ip" && t.item === "203.0.113.9" && t.hits === 2));
	assert.equal(agg.size, 0);
});

test("records countries and skips empty paths", () => {
	const agg = new Aggregator();
	const host = { host_type: "stream", host_id: 2 };
	agg.add(host, { ts: 1792960000, status: 200, ip: "203.0.113.9", path: "", bytes: 5, country: "US" });
	const { tops } = agg.drain();
	assert.ok(tops.some((t) => t.kind === "country" && t.item === "US"));
	assert.ok(!tops.some((t) => t.kind === "path"));
});

test("recognises local addresses", () => {
	for (const ip of [
		"192.168.1.1",
		"10.1.2.3",
		"172.18.0.1",
		"127.0.0.1",
		"100.64.0.9",
		"fd12::1",
		"fe80::1",
		"::1",
		"::ffff:192.168.1.5",
	]) {
		assert.equal(isLocalIp(ip), true, ip);
	}
	for (const ip of ["8.8.8.8", "172.32.0.1", "2001:db8::1", "not an ip"]) {
		assert.equal(isLocalIp(ip), false, ip);
	}
});

test("counts exact status codes only when asked to", () => {
	const host = { host_type: "proxy", host_id: 1 };
	const rec = { ts: 1792960000, status: 404, ip: "1.2.3.4", path: "/x", bytes: 1 };
	const off = new Aggregator();
	off.add(host, rec);
	assert.ok(!off.drain().tops.some((t) => t.kind === "status"));
	const on = new Aggregator({ statusCodes: true });
	on.add(host, rec);
	on.add(host, { ...rec, status: 200 });
	on.add(host, rec);
	const tops = on.drain().tops.filter((t) => t.kind === "status");
	assert.deepEqual(tops.map((t) => [t.item, t.hits]).sort(), [
		["200", 1],
		["404", 2],
	]);
});

test("drainBefore only hands out buckets that are over, and keeps the rest", () => {
	const agg = new Aggregator({ statusCodes: true });
	const host = { host_type: "proxy", host_id: 1 };
	const base = 1792958400; // an hour boundary
	agg.add(host, { ts: base + 10, status: 200, ip: "1.1.1.1", path: "/a", bytes: 1 });
	agg.add(host, { ts: base + 7300, status: 404, ip: "2.2.2.2", path: "/b", bytes: 1 });
	const early = agg.drainBefore(base + 3600);
	assert.equal(early.buckets.length, 1);
	assert.equal(early.buckets[0].bucket, base);
	assert.ok(early.tops.some((t) => t.kind === "status" && t.item === "200"));
	assert.ok(!early.tops.some((t) => t.item === "404"));
	assert.equal(agg.size, 1);
	const rest = agg.drain();
	assert.equal(rest.buckets[0].bucket, base + 7200);
	assert.ok(rest.tops.some((t) => t.kind === "status" && t.item === "404"));
});

test("only client IPs and paths are cut down; countries and status codes are kept whole", () => {
	const agg = new Aggregator({ statusCodes: true });
	const host = { host_type: "proxy", host_id: 1 };
	for (let i = 0; i < 60; i++) {
		agg.add(host, {
			ts: 1792958400,
			status: 200 + i,
			ip: `10.0.0.${i}`,
			path: `/p${i}`,
			bytes: 1,
			country: `C${i}`,
		});
	}
	const { tops } = agg.drain();
	const count = (kind) => tops.filter((t) => t.kind === kind).length;
	assert.equal(count("ip"), 25);
	assert.equal(count("path"), 25);
	assert.equal(count("status"), 60);
	assert.equal(count("country"), 60);
});
