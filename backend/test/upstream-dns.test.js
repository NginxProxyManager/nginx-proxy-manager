import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
	createModeResolver,
	isDynamicDnsEnabled,
	isIpLiteral,
	parseHostsFile,
	parseResolversConf,
	toNodeDnsServer,
} from "../lib/upstream-dns.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "npm-dns-test-"));
const resolversFile = path.join(tmp, "resolvers.conf");
const hostsFile = path.join(tmp, "hosts");
fs.writeFileSync(resolversFile, "resolver 127.0.0.11 valid=10s;\n");
fs.writeFileSync(hostsFile, "127.0.0.1 localhost\n172.17.0.1 host.docker.internal # extra_hosts\n");

const resolver = (overrides = {}) =>
	createModeResolver({
		env: {},
		resolversFile,
		hostsFile,
		resolveViaResolver: async (host) => host === "app",
		resolveViaSystem: async (host) => host === "app" || host === "short",
		...overrides,
	});

describe("parseResolversConf", () => {
	it("parses servers and options", () => {
		assert.deepEqual(parseResolversConf("resolver 127.0.0.11 [::1] ipv6=off valid=10s;"), {
			servers: ["127.0.0.11", "[::1]"],
			ipv6: false,
		});
		assert.deepEqual(parseResolversConf("resolver 1.1.1.1  valid=10s;\n"), { servers: ["1.1.1.1"], ipv6: true });
	});

	it("returns null without a resolver", () => {
		assert.equal(parseResolversConf(""), null);
		assert.equal(parseResolversConf(null), null);
		assert.equal(parseResolversConf("resolver  valid=10s;"), null);
		assert.equal(parseResolversConf("# resolver 1.1.1.1;"), null);
	});
});

describe("helpers", () => {
	it("converts nginx resolver addresses", () => {
		assert.equal(toNodeDnsServer("[::1]"), "::1");
		assert.equal(toNodeDnsServer("127.0.0.11"), "127.0.0.11");
	});

	it("parses hosts files", () => {
		const names = parseHostsFile("127.0.0.1 localhost Foo # x\n# comment\n\n::1 ip6-localhost");
		assert.ok(names.has("foo"));
		assert.ok(names.has("ip6-localhost"));
		assert.ok(!names.has("127.0.0.1"));
	});

	it("knows IP literals", () => {
		assert.ok(isIpLiteral("10.0.0.1"));
		assert.ok(isIpLiteral("[fd00::1]"));
		assert.ok(isIpLiteral("fd00::1"));
		assert.ok(!isIpLiteral("app"));
	});

	it("reads the env toggle", () => {
		assert.equal(isDynamicDnsEnabled({}), true);
		assert.equal(isDynamicDnsEnabled({ NPM_LOCATION_DYNAMIC_DNS: "false" }), false);
		assert.equal(isDynamicDnsEnabled({ NPM_LOCATION_DYNAMIC_DNS: "1" }), true);
	});
});

describe("createModeResolver", () => {
	it("uses dynamic mode for names the nginx resolver knows", async () => {
		assert.deepEqual(await resolver()("app"), { mode: "dynamic", status: "ok", reason: "resolver" });
	});

	it("keeps static mode for names only the system resolver knows", async () => {
		assert.equal((await resolver()("short")).mode, "static");
	});

	it("uses dynamic mode and flags unknown names", async () => {
		assert.deepEqual(await resolver()("nope"), { mode: "dynamic", status: "unresolved", reason: "not_found" });
	});

	it("keeps static mode for /etc/hosts names and IP literals", async () => {
		assert.equal((await resolver()("host.docker.internal")).reason, "etc_hosts");
		assert.equal((await resolver()("192.168.1.2")).reason, "ip_literal");
		assert.equal((await resolver()("[fd00::1]")).reason, "ip_literal");
	});

	it("is static when disabled or without a resolver", async () => {
		assert.equal((await resolver({ env: { NPM_LOCATION_DYNAMIC_DNS: "false" } })("nope")).mode, "static");
		assert.equal((await resolver({ env: { DISABLE_RESOLVER: "true" } })("nope")).mode, "static");
		assert.equal((await resolver({ resolversFile: path.join(tmp, "missing") })("nope")).reason, "no_resolver");
	});

	it("caches lookups", async () => {
		let calls = 0;
		const modeFor = resolver({
			resolveViaResolver: async () => {
				calls++;
				return true;
			},
		});
		await Promise.all([modeFor("x"), modeFor("X"), modeFor(" x ")]);
		assert.equal(calls, 1);
	});

	it("treats a failing lookup as not resolved", async () => {
		const modeFor = resolver({
			resolveViaResolver: async () => {
				throw new Error("boom");
			},
			resolveViaSystem: async () => {
				throw new Error("boom");
			},
		});
		assert.equal((await modeFor("x")).status, "unresolved");
	});
});
