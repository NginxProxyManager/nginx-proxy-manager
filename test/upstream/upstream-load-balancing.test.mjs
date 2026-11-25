import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { normalizeUpstreamServers, prepareUpstreamServers } from "../../backend/lib/upstream-servers.js";

const require = createRequire(new URL("../../backend/package.json", import.meta.url));
const Ajv = require("ajv");
const { Liquid } = require("liquidjs");

const backendDir = fileURLToPath(new URL("../../backend/", import.meta.url));
const schema = JSON.parse(readFileSync(join(backendDir, "schema/components/upstream-server-object.json"), "utf8"));
const validateServer = new Ajv({ strict: false }).compile(schema);
const engine = new Liquid({ root: join(backendDir, "templates") });
const template = readFileSync(join(backendDir, "templates/proxy_host.conf"), "utf8");

const render = (overrides = {}) =>
	engine.parseAndRender(template, {
		id: 7,
		enabled: true,
		forward_scheme: "http",
		forward_host: "127.0.0.1",
		forward_port: 8080,
		domain_names: ["example.com"],
		advanced_config: "",
		locations: "",
		use_default_location: true,
		upstream_servers: [],
		lb_method: "round_robin",
		...overrides,
	});

test("API server defaults render complete upstream directives", async () => {
	const servers = normalizeUpstreamServers([{ host: "app", port: 8080 }]);
	assert.deepEqual(servers[0], {
		host: "app",
		port: 8080,
		weight: 1,
		max_fails: 1,
		fail_timeout: "30s",
		backup: false,
		down: false,
	});
	const config = await render({ upstream_servers: prepareUpstreamServers(servers) });
	assert.match(config, /server app:8080 resolve max_fails=1 fail_timeout=30s;/);
	assert.match(config, /zone npm-7 256k;/);
	assert.match(config, /set \$server\s+"127\.0\.0\.1";/);
	assert.match(config, /set \$port\s+8080;/);
	assert.match(config, /proxy_pass\s+http:\/\/npm-7;/);
});

test("IP addresses do not request DNS re-resolution", () => {
	const servers = prepareUpstreamServers([
		{ host: "127.0.0.1", port: 8080 },
		{ host: "[::1]", port: 8080 },
		{ host: "app.internal", port: 8080 },
	]);
	assert.deepEqual(
		servers.map((server) => server.resolve),
		[false, false, true],
	);
});

test("upstream input rejects directive injection", () => {
	assert.equal(validateServer({ host: "app_service", port: 8080 }), true);
	assert.equal(validateServer({ host: "app; include /tmp/x", port: 8080 }), false);
	assert.equal(validateServer({ host: "app", port: 8080, fail_timeout: "30s; return 200" }), false);
});

test("asset cache uses the upstream group and direct hosts keep their include", async () => {
	const upstream = await render({
		caching_enabled: true,
		upstream_servers: prepareUpstreamServers([{ host: "app", port: 8080 }]),
	});
	assert.match(upstream, /proxy_pass http:\/\/npm-7\$request_uri;/);
	assert.doesNotMatch(upstream, /include conf\.d\/include\/assets\.conf;/);

	const direct = await render({ caching_enabled: true });
	assert.doesNotMatch(direct, /upstream npm-7/);
	assert.match(direct, /include conf\.d\/include\/assets\.conf;/);
});

test("invalid Nginx time values and malformed IPv6 are rejected before persistence", () => {
	for (const server of [
		{ host: "app", port: 80, fail_timeout: "1ms" },
		{ host: "[abcd]", port: 80 },
		{ host: "app..internal", port: 80 },
	]) {
		assert.throws(() => normalizeUpstreamServers([server]));
	}
	assert.equal(validateServer({ host: "app", port: 80, fail_timeout: "1ms" }), false);
});

test("IPv6 literals are bracketed only for rendering", () => {
	const input = [{ host: "2001:db8::1", port: 8080 }];
	assert.equal(prepareUpstreamServers(input)[0].host, "[2001:db8::1]");
	assert.equal(input[0].host, "2001:db8::1");
	assert.equal(validateServer(input[0]), true);
});

test("effective ip_hash configuration rejects backup servers", () => {
	const pool = [{ host: "primary", port: 80 }, { host: "backup", port: 80, backup: true }];
	assert.doesNotThrow(() => normalizeUpstreamServers(pool, "round_robin"));
	assert.throws(() => normalizeUpstreamServers(pool, "ip_hash"), /backup.*ip_hash/);
	assert.equal(normalizeUpstreamServers([{ host: "app", port: 80, max_fails: 0 }])[0].max_fails, 0);
});

test("backup-only pools are rejected while empty and administratively down pools remain valid", () => {
	assert.throws(() => normalizeUpstreamServers([{ host: "127.0.0.1", port: 80, backup: true }]), /non-backup/);
	assert.deepEqual(normalizeUpstreamServers([]), []);
	assert.equal(normalizeUpstreamServers([{ host: "127.0.0.1", port: 80, down: true }])[0].down, true);
});

test("upstream integer options cannot overflow or render exponential notation", () => {
	for (const field of ["weight", "max_fails"]) {
		for (const value of [2147483648, 1e21, 1.5]) {
			const input = { host: "127.0.0.1", port: 80, [field]: value };
			assert.equal(validateServer(input), false);
			assert.throws(() => normalizeUpstreamServers([input]));
		}
		assert.equal(validateServer({ host: "127.0.0.1", port: 80, [field]: 2147483647 }), true);
	}
});

test("custom upstream names are used for normal and cached requests", async () => {
	const config = await render({
		upstream_name: "my_backend",
		caching_enabled: true,
		upstream_servers: prepareUpstreamServers([{ host: "app", port: 8080 }]),
	});
	assert.match(config, /upstream my_backend \{/);
	assert.match(config, /proxy_pass\s+http:\/\/my_backend;/);
	assert.match(config, /proxy_pass http:\/\/my_backend\$request_uri;/);
	assert.match(config, /zone npm-7 256k;/);
});

test("direct forwarding preserves the group but routes normal and cached requests to the single server", async () => {
	const config = await render({
		forwarding_mode: "direct",
		upstream_name: "my_backend",
		upstream_servers: prepareUpstreamServers([{ host: "app", port: 8080 }]),
		caching_enabled: true,
	});
	assert.match(config, /upstream my_backend \{/);
	assert.match(config, /include conf\.d\/include\/proxy\.conf;/);
	assert.match(config, /include conf\.d\/include\/assets\.conf;/);
	assert.doesNotMatch(config, /proxy_pass\s+http:\/\/my_backend/);
});
