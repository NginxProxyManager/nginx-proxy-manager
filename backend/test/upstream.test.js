import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import { normalizeUpstreamServers, prepareUpstreamServers } from "../lib/upstream.js";
import utils from "../lib/utils.js";

const template = fs.readFileSync(new URL("../templates/proxy_host.conf", import.meta.url), "utf8");

const render = (o, hasResolver = true) => {
	const host = {
		enabled: true,
		id: 3,
		domain_names: ["example.com"],
		forward_scheme: "http",
		forward_host: "backend",
		forward_port: 8080,
		certificate_id: 0,
		locations: "",
		advanced_config: "",
		use_default_location: true,
		ipv6: true,
		lb_method: "round_robin",
		upstream_servers: [],
		...o,
	};
	host.upstream_servers = prepareUpstreamServers(host.upstream_servers, hasResolver);
	return utils.getRenderEngine().parseAndRender(template, host);
};

const serverLines = (config) =>
	config
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l.startsWith("server ") && !l.startsWith("server {"));

describe("upstream servers", () => {
	it("fills in the optional fields API clients may leave out", () => {
		assert.deepEqual(normalizeUpstreamServers([{ host: "a", port: 80, max_fails: null }]), [
			{ host: "a", port: 80, weight: 1, max_fails: 1, fail_timeout: "30s", backup: false, down: false },
		]);
		assert.deepEqual(normalizeUpstreamServers([{ host: "a", port: 80, max_fails: 0, fail_timeout: "5s" }])[0], {
			host: "a",
			port: 80,
			weight: 1,
			max_fails: 0,
			fail_timeout: "5s",
			backup: false,
			down: false,
		});
		assert.deepEqual(normalizeUpstreamServers(null), []);
		assert.deepEqual(normalizeUpstreamServers(undefined), []);
	});

	it("renders servers sent with only host and port as valid parameters", async () => {
		const config = await render({ upstream_servers: [{ host: "10.0.0.1", port: 80 }] });
		assert.deepEqual(serverLines(config), ["server 10.0.0.1:80 weight=1 max_fails=1 fail_timeout=30s;"]);
	});

	it("resolves host names at run time so one missing backend can't stop nginx", async () => {
		const servers = [
			{ host: "app1", port: 80 },
			{ host: "10.0.0.2", port: 80, backup: true },
			{ host: "::1", port: 81, down: true },
		];
		assert.deepEqual(serverLines(await render({ upstream_servers: servers })), [
			"server app1:80 weight=1 max_fails=1 fail_timeout=30s resolve;",
			"server 10.0.0.2:80 weight=1 max_fails=1 fail_timeout=30s backup;",
			"server [::1]:81 weight=1 max_fails=1 fail_timeout=30s down;",
		]);
		const config = await render({ upstream_servers: servers });
		assert.match(config, /upstream npm-3 \{\s*zone npm-3 64k;/);
	});

	it("doesn't use resolve without a resolver", async () => {
		const config = await render({ upstream_servers: [{ host: "app1", port: 80 }] }, false);
		assert.deepEqual(serverLines(config), ["server app1:80 weight=1 max_fails=1 fail_timeout=30s;"]);
	});

	it("keeps $server and $port set for custom config in upstream mode", async () => {
		const config = await render({ upstream_servers: [{ host: "app1", port: 80 }] });
		assert.match(config, /set \$server\s+"backend";/);
		assert.match(config, /set \$port\s+8080;/);
		assert.match(config, /set \$lb_upstream\s+"npm-3";/);
		assert.match(config, /include conf\.d\/include\/proxy-upstream\.conf;/);
		assert.doesNotMatch(config, /include conf\.d\/include\/proxy\.conf;/);
	});

	it("renders the balancing method", async () => {
		const servers = [{ host: "app1", port: 80 }];
		assert.match(await render({ upstream_servers: servers, lb_method: "least_conn" }), /^\s*least_conn;$/m);
		assert.match(await render({ upstream_servers: servers, lb_method: "ip_hash" }), /^\s*ip_hash;$/m);
		const rr = await render({ upstream_servers: servers });
		assert.doesNotMatch(rr, /least_conn|ip_hash/);
	});

	it("leaves hosts without upstream servers unchanged", async () => {
		const config = await render({});
		assert.doesNotMatch(config, /upstream npm-|lb_upstream/);
		assert.match(config, /include conf\.d\/include\/proxy\.conf;/);
	});
});
