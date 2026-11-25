import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getHealthInterval, isDnsDiscoveryEnabled, isDockerDiscoveryEnabled } from "../lib/upstream/config.js";
import { createRateLimiter } from "../lib/upstream/rate-limit.js";
import {
	createLimiter,
	intToIpv4,
	isValidHost,
	parseIpv4Cidr,
	parseProcNetRouteGateways,
	parsePtrName,
	parseResolvConfNameservers,
	parseResolversConf,
	splitHostPath,
} from "../lib/upstream/util.js";

describe("util: PTR name parsing (Docker embedded DNS)", () => {
	it("drops the network label", () => {
		assert.deepEqual(parsePtrName("app.mynet."), [{ host: "app", network: "mynet" }]);
		assert.deepEqual(parsePtrName("myproj-web-1.myproj_default"), [
			{ host: "myproj-web-1", network: "myproj_default" },
		]);
	});

	it("offers the first label as a fallback for dotted names", () => {
		assert.deepEqual(parsePtrName("app.my.net."), [
			{ host: "app.my", network: "net" },
			{ host: "app", network: "my.net" },
		]);
	});

	it("ignores single-label and invalid answers", () => {
		assert.deepEqual(parsePtrName("myhost"), []);
		assert.deepEqual(parsePtrName(""), []);
		assert.deepEqual(parsePtrName("."), []);
		assert.deepEqual(parsePtrName(null), []);
		assert.deepEqual(parsePtrName("bad name.net"), []);
	});
});

describe("util: host handling", () => {
	it("splits host/path like the location renderer", () => {
		assert.deepEqual(splitHostPath("10.0.0.1/path/"), { host: "10.0.0.1", path: "/path/" });
		assert.deepEqual(splitHostPath("  app  "), { host: "app", path: "" });
		assert.deepEqual(splitHostPath(undefined), { host: "", path: "" });
	});

	it("validates hosts", () => {
		for (const ok of ["app", "my-app_1", "example.com", "example.com.", "10.0.0.1", "::1", "[fe80::1]"]) {
			assert.equal(isValidHost(ok), true, ok);
		}
		for (const bad of [
			"",
			"a b",
			"a;",
			"{a}",
			"a'",
			'a"',
			"a`",
			"a$b",
			"a\\b",
			"a#b",
			"-a",
			"a..b",
			"a\nb",
			"x".repeat(254),
		]) {
			assert.equal(isValidHost(bad), false, bad);
		}
	});
});

describe("util: networks", () => {
	it("parses CIDRs", () => {
		const r = parseIpv4Cidr("172.18.0.5/16");
		assert.equal(intToIpv4(r.network), "172.18.0.0");
		assert.equal(intToIpv4(r.first), "172.18.0.1");
		assert.equal(intToIpv4(r.last), "172.18.255.254");
		assert.equal(parseIpv4Cidr("10.0.0.1/32").first, parseIpv4Cidr("10.0.0.1/32").last);
		assert.equal(parseIpv4Cidr("nope"), null);
		assert.equal(parseIpv4Cidr("300.0.0.1/8"), null);
	});

	it("parses /proc/net/route gateways", () => {
		const content = [
			"Iface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask\t\tMTU\tWindow\tIRTT",
			"eth0\t00000000\t010012AC\t0003\t0\t0\t0\t00000000\t0\t0\t0",
			"eth0\t000012AC\t00000000\t0001\t0\t0\t0\t0000FFFF\t0\t0\t0",
		].join("\n");
		assert.deepEqual(parseProcNetRouteGateways(content), ["172.18.0.1"]);
	});

	it("parses resolvers.conf", () => {
		assert.deepEqual(parseResolversConf("resolver 127.0.0.11 valid=10s;\n"), {
			servers: ["127.0.0.11"],
			ipv6: true,
		});
		assert.deepEqual(parseResolversConf("resolver 1.1.1.1 [2606:4700::1111] 9.9.9.9:5353 ipv6=off valid=10s;"), {
			servers: ["1.1.1.1", "2606:4700::1111", "9.9.9.9:5353"],
			ipv6: false,
		});
		assert.equal(parseResolversConf(""), null);
		assert.equal(parseResolversConf("resolver  valid=10s;"), null);
		assert.equal(parseResolversConf(undefined), null);
	});

	it("parses resolv.conf nameservers", () => {
		assert.deepEqual(
			parseResolvConfNameservers("# x\nnameserver 127.0.0.11\nsearch lan\nnameserver fe80::1%eth0\n"),
			["127.0.0.11", "fe80::1"],
		);
	});
});

describe("util: concurrency limiter", () => {
	it("never runs more than max at once", async () => {
		const limit = createLimiter(3);
		let active = 0;
		let peak = 0;
		const jobs = Array.from({ length: 10 }, (_, i) =>
			limit(async () => {
				active++;
				peak = Math.max(peak, active);
				await new Promise((r) => setTimeout(r, 5));
				active--;
				return i;
			}),
		);
		assert.deepEqual(await Promise.all(jobs), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
		assert.equal(peak, 3);
	});

	it("propagates rejections and keeps going", async () => {
		const limit = createLimiter(1);
		await assert.rejects(limit(() => Promise.reject(new Error("x"))));
		assert.equal(await limit(() => 5), 5);
	});
});

describe("rate limiter", () => {
	it("allows up to the limit per window, per key", () => {
		let now = 1000;
		const rl = createRateLimiter({ limit: 6, windowMs: 60000, now: () => now });
		for (let i = 0; i < 6; i++) {
			assert.equal(rl.consume("u1").ok, true);
		}
		const denied = rl.consume("u1");
		assert.equal(denied.ok, false);
		assert.equal(denied.retryAfter, 60);
		assert.equal(rl.consume("u2").ok, true, "other users are unaffected");

		now += 30000;
		assert.equal(rl.consume("u1").ok, false);
		now += 30001;
		assert.equal(rl.consume("u1").ok, true, "window slid");
	});

	it("counts units and does not consume on denial", () => {
		let now = 0;
		const rl = createRateLimiter({ limit: 60, windowMs: 60000, now: () => now });
		assert.equal(rl.consume("u", 20).ok, true);
		now += 10000;
		assert.equal(rl.consume("u", 20).ok, true);
		now += 10000;
		const denied = rl.consume("u", 21);
		assert.equal(denied.ok, false);
		assert.equal(denied.remaining, 20);
		// Needs the first 20 to expire: at t=60000, now is 20000 -> 40s
		assert.equal(denied.retryAfter, 40);
		assert.equal(rl.consume("u", 20).ok, true, "denied request consumed nothing");
		assert.equal(rl.consume("u", 1).ok, false);
	});

	it("forgets idle keys", () => {
		let now = 0;
		const rl = createRateLimiter({ limit: 1, windowMs: 1000, now: () => now });
		rl.consume("a");
		rl.consume("b");
		assert.equal(rl.size(), 2);
		now += 5000;
		rl.consume("c");
		assert.equal(rl.size(), 1);
	});
});

describe("config", () => {
	const withEnv = (vars, fn) => {
		const saved = {};
		for (const [k, v] of Object.entries(vars)) {
			saved[k] = process.env[k];
			if (v === undefined) {
				delete process.env[k];
			} else {
				process.env[k] = v;
			}
		}
		try {
			fn();
		} finally {
			for (const [k, v] of Object.entries(saved)) {
				if (v === undefined) {
					delete process.env[k];
				} else {
					process.env[k] = v;
				}
			}
		}
	};

	it("has safe defaults", () => {
		withEnv(
			{ NPM_DOCKER_DISCOVERY: undefined, NPM_DNS_DISCOVERY: undefined, NPM_UPSTREAM_HEALTH_INTERVAL: undefined },
			() => {
				assert.equal(isDockerDiscoveryEnabled(), false);
				assert.equal(isDnsDiscoveryEnabled(), true);
				assert.equal(getHealthInterval(), 60);
			},
		);
	});

	it("parses values", () => {
		withEnv({ NPM_DOCKER_DISCOVERY: "true", NPM_DNS_DISCOVERY: "0", NPM_UPSTREAM_HEALTH_INTERVAL: "0" }, () => {
			assert.equal(isDockerDiscoveryEnabled(), true);
			assert.equal(isDnsDiscoveryEnabled(), false);
			assert.equal(getHealthInterval(), 0);
		});
		withEnv({ NPM_UPSTREAM_HEALTH_INTERVAL: "3" }, () => assert.equal(getHealthInterval(), 10));
		withEnv({ NPM_UPSTREAM_HEALTH_INTERVAL: "abc" }, () => assert.equal(getHealthInterval(), 60));
		withEnv({ NPM_UPSTREAM_HEALTH_INTERVAL: "300" }, () => assert.equal(getHealthInterval(), 300));
	});
});
