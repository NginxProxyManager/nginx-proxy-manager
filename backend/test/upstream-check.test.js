import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import {
	checkTarget,
	checkTargets,
	combineLookups,
	forResolverTarget,
	formatMs,
	MESSAGES,
	resolverLookup,
	systemLookup,
	targetKey,
	tcpConnect,
} from "../lib/upstream/check.js";
import { hasCustomResolver, hostSetsResolver } from "../lib/upstream/util.js";

const listen = (server) =>
	new Promise((resolve) => {
		server.listen(0, "127.0.0.1", () => resolve(server.address().port));
	});

/** A port that is guaranteed closed: bind, read the port, close */
const closedPort = async () => {
	const server = net.createServer();
	const port = await listen(server);
	await new Promise((resolve) => server.close(resolve));
	return port;
};

const dnsError = (code) => Object.assign(new Error(code), { code });

/** Fake system lookup: name -> addresses, or error code */
const fakeLookup = (table) => async (host) => {
	const entry = table[host];
	if (Array.isArray(entry)) {
		return entry.map((address) => ({ address, family: net.isIPv6(address) ? 6 : 4 }));
	}
	throw dnsError(entry || "ENOTFOUND");
};

/** Fake c-ares resolver */
const fakeResolver = (table) => ({
	resolve4: async (host) => {
		const entry = table[host];
		if (Array.isArray(entry)) {
			return entry.filter((a) => net.isIPv4(a));
		}
		throw dnsError(entry || "ENOTFOUND");
	},
	resolve6: async (host) => {
		const entry = table[host];
		if (Array.isArray(entry)) {
			const v6 = entry.filter((a) => net.isIPv6(a));
			if (v6.length) {
				return v6;
			}
		}
		throw dnsError("ENODATA");
	},
});

const RESOLVERS = { servers: ["127.0.0.11"], ipv6: true };

describe("upstream check: classification against local servers", () => {
	const server = net.createServer((socket) => socket.end());
	let openPort;
	let refusedPort;

	before(async () => {
		openPort = await listen(server);
		refusedPort = await closedPort();
	});
	after(() => new Promise((resolve) => server.close(resolve)));

	it("ok for an open port on an IP literal", async () => {
		const result = await checkTarget({ host: "127.0.0.1", port: openPort, scheme: "http" }, { resolvers: null });
		assert.equal(result.ok, true);
		assert.equal(result.code, "ok");
		assert.deepEqual(result.addresses, ["127.0.0.1"]);
		assert.equal(result.resolver_ok, null);
		assert.equal(result.system_ok, null);
		assert.equal(typeof result.ms, "number");
		assert.match(result.message, /reachable/);
	});

	it("tcp_refused for a closed port", async () => {
		const result = await checkTarget({ host: "127.0.0.1", port: refusedPort }, { resolvers: null });
		assert.equal(result.ok, false);
		assert.equal(result.code, "tcp_refused");
		assert.equal(result.ms, null);
		assert.match(result.message, /refused/);
	});

	it("resolves names through both views and connects", async () => {
		const result = await checkTarget(
			{ host: "app", port: openPort, scheme: "http" },
			{
				resolvers: RESOLVERS,
				lookup: fakeLookup({ app: ["127.0.0.1"] }),
				resolver: fakeResolver({ app: ["127.0.0.1"] }),
			},
		);
		assert.equal(result.code, "ok");
		assert.equal(result.system_ok, true);
		assert.equal(result.resolver_ok, true);
	});

	it("resolver_mismatch when only /etc/hosts or a search domain resolves it", async () => {
		const result = await checkTarget(
			{ host: "host.docker.internal", port: openPort },
			{
				resolvers: RESOLVERS,
				lookup: fakeLookup({ "host.docker.internal": ["127.0.0.1"] }),
				resolver: fakeResolver({}),
			},
		);
		assert.equal(result.ok, true);
		assert.equal(result.code, "resolver_mismatch");
		assert.equal(result.system_ok, true);
		assert.equal(result.resolver_ok, false);
		assert.match(result.message, /\/etc\/hosts/);
	});

	it("a TCP failure wins over resolver_mismatch", async () => {
		const result = await checkTarget(
			{ host: "only-hosts", port: refusedPort },
			{ resolvers: RESOLVERS, lookup: fakeLookup({ "only-hosts": ["127.0.0.1"] }), resolver: fakeResolver({}) },
		);
		assert.equal(result.ok, false);
		assert.equal(result.code, "tcp_refused");
	});

	it("dns_not_found when neither view resolves", async () => {
		const result = await checkTarget(
			{ host: "nonexistent", port: 80 },
			{ resolvers: RESOLVERS, lookup: fakeLookup({}), resolver: fakeResolver({ nonexistent: "ESERVFAIL" }) },
		);
		assert.equal(result.ok, false);
		assert.equal(result.code, "dns_not_found");
		assert.equal(result.system_ok, false);
		assert.equal(result.resolver_ok, false);
		assert.deepEqual(result.addresses, []);
	});

	it("dns_timeout only when every view timed out", async () => {
		const result = await checkTarget(
			{ host: "slow", port: 80 },
			{
				resolvers: RESOLVERS,
				lookup: fakeLookup({ slow: "ETIMEDOUT" }),
				resolver: fakeResolver({ slow: "ETIMEOUT" }),
			},
		);
		assert.equal(result.code, "dns_timeout");

		const mixed = await checkTarget(
			{ host: "slow", port: 80 },
			{
				resolvers: RESOLVERS,
				lookup: fakeLookup({ slow: "ENOTFOUND" }),
				resolver: fakeResolver({ slow: "ETIMEOUT" }),
			},
		);
		assert.equal(mixed.code, "dns_not_found");
	});

	it("a fast EAI_AGAIN + SERVFAIL (Docker embedded DNS, single-label name) is not found", async () => {
		// Measured on Docker: lookup("doesnotexist") -> EAI_AGAIN in ~5ms, resolve4 -> ESERVFAIL
		const result = await checkTarget(
			{ host: "doesnotexist", port: 80 },
			{
				resolvers: RESOLVERS,
				lookup: fakeLookup({ doesnotexist: "EAI_AGAIN" }),
				resolver: fakeResolver({ doesnotexist: "ESERVFAIL" }),
			},
		);
		assert.equal(result.code, "dns_not_found");
	});

	it("a hanging system lookup is cut off", async () => {
		const started = Date.now();
		const result = await checkTarget(
			{ host: "hang", port: 80 },
			{ resolvers: null, lookup: () => new Promise(() => {}) },
		);
		assert.equal(result.code, "dns_timeout");
		assert.ok(Date.now() - started < 4000);
	});

	it("resolver_ok is null when nginx has no resolver", async () => {
		const result = await checkTarget(
			{ host: "app", port: openPort },
			{ resolvers: null, lookup: fakeLookup({ app: ["127.0.0.1"] }) },
		);
		assert.equal(result.code, "ok");
		assert.equal(result.resolver_ok, null);
	});

	it("strips a /path from the host", async () => {
		const result = await checkTarget({ host: "127.0.0.1/api/v1", port: openPort }, { resolvers: null });
		assert.equal(result.code, "ok");
		assert.equal(result.host, "127.0.0.1");
	});

	it("tries the next address when the first refuses", async () => {
		const result = await checkTarget(
			{ host: "multi", port: openPort },
			{ resolvers: null, lookup: fakeLookup({ multi: ["127.0.0.2", "127.0.0.1"] }) },
		);
		// 127.0.0.2 also lands on loopback on Linux, so either way it must connect
		assert.equal(result.ok, true);
	});
});

describe("upstream check: input validation", () => {
	for (const host of [
		"",
		" ",
		"a b",
		"a;b",
		"a{b",
		"a}b",
		"a'b",
		'a"b',
		"a`b",
		"$host x",
		"a$host;",
		"-bad",
		"a..b",
	]) {
		it(`invalid_host for ${JSON.stringify(host)}`, async () => {
			const result = await checkTarget({ host, port: 80 }, { resolvers: null, lookup: fakeLookup({}) });
			assert.equal(result.code, "invalid_host");
			assert.equal(result.ok, false);
		});
	}

	it("does not check a forward host that is an nginx variable", async () => {
		for (const host of ["$backend", "$server/sub", "app-$stage", "app-$stage/sub", "a$host"]) {
			const result = await checkTarget({ host, port: 80 }, { resolvers: null, lookup: fakeLookup({}) });
			assert.equal(result.code, "disabled", host);
			assert.match(result.message, /nginx variable/);
			assert.deepEqual(result.addresses, []);
		}
	});

	it("accepts IPv6 literals with and without brackets", async () => {
		for (const host of ["::1", "[::1]"]) {
			const result = await checkTarget({ host, port: await closedPort() }, { resolvers: null });
			assert.notEqual(result.code, "invalid_host");
		}
	});

	it("rejects bad ports", async () => {
		const result = await checkTarget({ host: "127.0.0.1", port: 0 }, { resolvers: null });
		assert.equal(result.code, "invalid_host");
	});

	it("disabled does not touch the network", async () => {
		let called = false;
		const result = await checkTarget(
			{ host: "app", port: 80 },
			{
				enabled: false,
				lookup: () => {
					called = true;
				},
			},
		);
		assert.equal(result.code, "disabled");
		assert.equal(result.ok, false);
		assert.equal(called, false);
	});
});

describe("upstream check: each lookup method on its own", () => {
	// Bound to 127.0.0.1 only: the same port on 127.0.0.2 refuses
	const server = net.createServer((socket) => socket.end());
	let port;
	before(async () => {
		port = await listen(server);
	});
	after(() => new Promise((resolve) => server.close(resolve)));

	// /etc/hosts points to the working server, nginx's resolver to an address that refuses
	const split = (target) =>
		checkTarget(target, {
			resolvers: RESOLVERS,
			lookup: fakeLookup({ app: ["127.0.0.1"] }),
			resolver: fakeResolver({ app: ["127.0.0.2"] }),
		});

	it("a target nginx resolves per request only counts the resolver's addresses", async () => {
		const result = await split({ host: "app", port, resolver: true });
		assert.equal(result.ok, false);
		assert.equal(result.code, "tcp_refused");
		assert.deepEqual(result.lookups.resolver, { ok: false, code: "tcp_refused", addresses: ["127.0.0.2"], ms: null });
		assert.equal(result.lookups.system.ok, true);
		assert.deepEqual(result.lookups.system.addresses, ["127.0.0.1"]);
	});

	it("a static target only counts the system's addresses", async () => {
		const result = await split({ host: "app", port, resolver: false });
		assert.equal(result.ok, true);
		assert.equal(result.code, "ok");
	});

	it("without a known mode every method that finds the name has to reach it", async () => {
		const result = await split({ host: "app", port });
		assert.equal(result.ok, false);
		assert.equal(result.code, "tcp_refused");
		// the API output stays as it was, with the detail per method next to it
		for (const key of ["host", "port", "scheme", "ok", "code", "message", "addresses", "resolver_ok", "system_ok", "ms"]) {
			assert.ok(key in result, key);
		}
		assert.deepEqual(result.addresses, ["127.0.0.2", "127.0.0.1"]);
		assert.equal(result.resolver_ok, true);
		assert.equal(result.system_ok, true);
	});

	it("forResolverTarget re-reads a result for the target's method (health monitor, config test)", async () => {
		const [shared] = await checkTargets([{ host: "app", port }], {
			resolvers: RESOLVERS,
			lookup: fakeLookup({ app: ["127.0.0.1"] }),
			resolver: fakeResolver({ app: ["127.0.0.2"] }),
		});
		const dynamic = forResolverTarget(shared, { host: "app", port }, true);
		assert.equal(dynamic.ok, false);
		assert.equal(dynamic.code, "tcp_refused");
		const literal = forResolverTarget(shared, { host: "app/api", port }, false);
		assert.equal(literal.ok, true);
		assert.equal(literal.code, "ok");
		assert.equal(literal.host, "app", "the host stays as checkTargets echoed it");
	});

	it("a name only /etc/hosts knows: not ok per request, ok (with the warning code) for a static target", async () => {
		const opts = { resolvers: RESOLVERS, lookup: fakeLookup({ app: ["127.0.0.1"] }), resolver: fakeResolver({}) };
		const dynamic = await checkTarget({ host: "app", port, resolver: true }, opts);
		assert.equal(dynamic.ok, false);
		assert.equal(dynamic.code, "resolver_mismatch");
		assert.match(dynamic.message, /nginx resolves this upstream per request/);
		const literal = await checkTarget({ host: "app", port, resolver: false }, opts);
		assert.equal(literal.ok, true);
		assert.equal(literal.code, "resolver_mismatch");
	});
});

describe("upstream check: batching", () => {
	it("dedupes identical targets and keeps order and the given host", async () => {
		let calls = 0;
		const lookup = async () => {
			calls++;
			throw dnsError("ENOTFOUND");
		};
		const results = await checkTargets(
			[
				{ host: "x", port: 80 },
				{ host: "x/a", port: 80 },
				{ host: "y", port: 80 },
				{ host: "X", port: 80 },
			],
			{ resolvers: null, lookup },
		);
		assert.equal(results.length, 4);
		assert.deepEqual(
			results.map((r) => r.host),
			["x", "x/a", "y", "X"],
		);
		assert.equal(calls, 2);
		assert.equal(targetKey({ host: " App/x ", port: 1 }), "app|1|");
	});
});

describe("upstream check: primitives", () => {
	it("tcpConnect times out when the connection neither opens nor fails", async () => {
		// a socket that never answers, independent of the host's network
		let destroyed = false;
		const silent = () =>
			Object.assign(new EventEmitter(), {
				connect: () => {},
				destroy: () => {
					destroyed = true;
				},
			});
		const result = await tcpConnect("192.0.2.1", 9, 50, silent);
		assert.deepEqual(result, { ok: false, code: "tcp_timeout", ms: null, error: "ETIMEDOUT" });
		assert.equal(destroyed, true);
	});

	it("systemLookup keeps its DNS slot until a timed-out lookup settles", async () => {
		// the cap is 16: lookups that time out for the caller still run (getaddrinfo can't be cancelled)
		let running = 0;
		let most = 0;
		const pending = [];
		const lookup = () =>
			new Promise((resolve) => {
				running++;
				most = Math.max(most, running);
				pending.push(() => {
					running--;
					resolve([{ address: "10.0.0.1" }]);
				});
			});
		const first = await Promise.all(
			Array.from({ length: 16 }, () => systemLookup("slow", { lookup, timeoutMs: 20 })),
		);
		assert.ok(first.every((r) => r.timeout && r.error === "ETIMEOUT"));
		// more lookups wait for a free slot instead of starting while those still run (another test may hold a
		// slot with a lookup that never settles, so not all 16 need to have started)
		const started = running;
		assert.ok(started > 0 && started <= 16);
		const more = Promise.all(Array.from({ length: 4 }, () => systemLookup("slow", { lookup, timeoutMs: 20 })));
		await new Promise((resolve) => setTimeout(resolve, 40));
		assert.equal(running, started);
		while (pending.length) {
			pending.shift()();
			await new Promise((resolve) => setImmediate(resolve));
		}
		await more;
		assert.ok(most <= 16);
	});

	it("resolverLookup returns null without resolvers", async () => {
		assert.equal(await resolverLookup("app", null), null);
		assert.equal(await resolverLookup("app", { servers: [] }), null);
	});

	it("resolverLookup skips AAAA with ipv6=off", async () => {
		let asked6 = false;
		const resolver = {
			resolve4: async () => ["10.0.0.1"],
			resolve6: async () => {
				asked6 = true;
				return ["::1"];
			},
		};
		const out = await resolverLookup("app", { servers: ["1.1.1.1"], ipv6: false }, { resolver });
		assert.deepEqual(out.addresses, ["10.0.0.1"]);
		assert.equal(asked6, false);
	});
});

describe("upstream check: messages", () => {
	it("shows whole milliseconds and <1 ms below one", () => {
		assert.equal(formatMs(0), "<1 ms");
		assert.equal(formatMs(0.4), "<1 ms");
		assert.equal(formatMs(1), "1 ms");
		assert.equal(formatMs(2.6), "3 ms");
		assert.equal(MESSAGES.ok({ host: "app", port: 80 }, { ms: 0.3 }), "app:80 is reachable (<1 ms).");
		assert.equal(MESSAGES.ok({ host: "app", port: 80 }, { ms: null }), "app:80 is reachable.");
		assert.match(MESSAGES.resolver_mismatch({ host: "app", port: 80 }, { ms: 12.2 }), /^app:80 is reachable \(12 ms\), but/);
	});
});

describe("upstream check: no nginx resolver (DISABLE_RESOLVER)", () => {
	const system = { ok: true, code: "ok", addresses: ["10.0.0.5"], ms: 3 };
	const lookups = { system, resolver: null };

	it("is not ok for a hostname nginx resolves per request", () => {
		assert.deepEqual(combineLookups(lookups, true), { ok: false, code: "no_resolver", ms: 3 });
		// a name that doesn't exist at all is still not found
		const missing = { ok: false, code: "dns_not_found", addresses: [], ms: null };
		assert.equal(combineLookups({ system: missing, resolver: null }, true).code, "dns_not_found");
	});

	it("stays ok for a literal upstream, a resolver in the custom http config, or an unknown mode", () => {
		assert.equal(combineLookups(lookups, false).ok, true);
		assert.equal(combineLookups(lookups, true, true).ok, true);
		assert.equal(combineLookups(lookups, undefined).ok, true);
	});

	it("checkTarget and forResolverTarget report it with a message, an IP target is fine", async () => {
		const server = net.createServer((s) => s.destroy());
		const port = await listen(server);
		try {
			const opts = {
				resolvers: null,
				customResolver: false,
				lookup: async () => [{ address: "127.0.0.1", family: 4 }],
			};
			const dynamic = await checkTarget({ host: "app", port, resolver: true }, opts);
			assert.equal(dynamic.ok, false);
			assert.equal(dynamic.code, "no_resolver");
			assert.match(dynamic.message, /no DNS resolver/);
			const literal = await checkTarget({ host: "app", port, resolver: false }, opts);
			assert.equal(literal.ok, true);
			assert.equal(forResolverTarget(literal, { host: "app", port }, true, false).code, "no_resolver");
			assert.equal(forResolverTarget(literal, { host: "app", port }, true, true).ok, true);
			const ip = await checkTarget({ host: "127.0.0.1", port, resolver: true }, opts);
			assert.equal(ip.ok, true);
			const custom = await checkTarget({ host: "app", port, resolver: true }, { ...opts, customResolver: true });
			assert.equal(custom.ok, true);
		} finally {
			server.close();
		}
	});

	it("finds a resolver in a host's or a custom location's advanced configuration", () => {
		const host = {
			advanced_config: "",
			locations: [{ advanced_config: "resolver 127.0.0.11;" }, { advanced_config: "proxy_set_header X y;" }],
		};
		assert.equal(hostSetsResolver(host), false);
		// a location's resolver only serves that location
		assert.equal(hostSetsResolver(host, 0), true);
		assert.equal(hostSetsResolver(host, 1), false);
		// the host's (server level) serves the main target and every location
		const server = { ...host, advanced_config: "client_max_body_size 1m;\nresolver 1.1.1.1 valid=30s;" };
		assert.equal(hostSetsResolver(server), true);
		assert.equal(hostSetsResolver(server, 1), true);
		// not in a nested location, a comment, a string or a Lua block
		for (const text of [
			"location /x {\n  resolver 1.1.1.1;\n}",
			"# resolver 1.1.1.1;",
			'add_header X "resolver 1.1.1.1;";',
			"content_by_lua_block {\n  ngx.say('resolver 1.1.1.1;')\n}",
		]) {
			assert.equal(hostSetsResolver({ advanced_config: text }), false, text);
		}
		assert.equal(hostSetsResolver(null), false);
		assert.equal(hostSetsResolver({ advanced_config: null, locations: [{}] }, 0), false);
	});

	it("finds a resolver in the custom http config", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "npm-custom-resolver-"));
		try {
			const top = path.join(dir, "http_top.conf");
			const http = path.join(dir, "http.conf");
			fs.writeFileSync(top, "# resolver 1.1.1.1;\nmap $a $b { default x; }\n");
			assert.equal(hasCustomResolver([top, http]), false);
			fs.writeFileSync(http, "resolver 127.0.0.11 valid=10s;\n");
			assert.equal(hasCustomResolver([top, http]), true);
			// only at the http level
			fs.writeFileSync(http, "server {\n  resolver 127.0.0.11;\n}\n");
			assert.equal(hasCustomResolver([top, http]), false);
			// or at the server level of every proxy host
			const serverProxy = path.join(dir, "server_proxy.conf");
			fs.writeFileSync(serverProxy, "resolver 127.0.0.11 ipv6=off;\n");
			assert.equal(hasCustomResolver([top, http, serverProxy]), true);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});
