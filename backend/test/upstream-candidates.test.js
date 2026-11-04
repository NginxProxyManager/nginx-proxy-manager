import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildHistoryCandidates, mergeCandidates } from "../lib/upstream/candidates.js";

const item = (host, source, extra = {}) => ({
	host,
	label: `${host} (${source})`,
	source,
	ports: [],
	hint_port: null,
	hint_scheme: null,
	network: null,
	state: null,
	ip: null,
	used_by: 0,
	...extra,
});

describe("candidates: history", () => {
	const proxyHosts = [
		{
			id: 1,
			forward_host: "app",
			forward_port: 8080,
			forward_scheme: "http",
			locations: [
				{ path: "/api", forward_host: "api/v1/", forward_port: 9000, forward_scheme: "http" },
				{ path: "/app2", forward_host: " app ", forward_port: 8081, forward_scheme: "http" },
				{ path: "/bad", forward_host: "bad host", forward_port: 1 },
			],
		},
		{ id: 2, forward_host: "APP", forward_port: 8080, forward_scheme: "https", locations: null },
		{ id: 3, forward_host: "10.0.0.5", forward_port: 443, forward_scheme: "https", locations: [] },
	];
	const streams = [
		{ id: 7, forwarding_host: "db", forwarding_port: 5432 },
		{ id: 8, forwarding_host: "app", forwarding_port: 8080 },
	];
	const items = buildHistoryCandidates({ proxyHosts, streams });
	const byHost = Object.fromEntries(items.map((i) => [i.host.toLowerCase(), i]));

	it("collects proxy, location (with /path split) and stream targets", () => {
		assert.deepEqual(Object.keys(byHost).sort(), ["10.0.0.5", "api", "app", "db"]);
	});

	it("unions ports and counts distinct users", () => {
		assert.deepEqual(byHost.app.ports, [8080, 8081]);
		// proxy host 1 (main + location counted once), proxy host 2, stream 8
		assert.equal(byHost.app.used_by, 3);
		assert.equal(byHost.app.hint_port, null);
		assert.equal(byHost.app.hint_scheme, null, "mixed schemes give no hint");
		assert.equal(byHost.api.hint_port, 9000);
		assert.equal(byHost.api.hint_scheme, "http");
		assert.equal(byHost["10.0.0.5"].hint_scheme, "https");
		assert.equal(byHost.db.used_by, 1);
		assert.equal(byHost.db.source, "history");
	});

	it("handles empty input", () => {
		assert.deepEqual(buildHistoryCandidates(), []);
		assert.deepEqual(buildHistoryCandidates({ proxyHosts: [null], streams: [{}] }), []);
	});
});

describe("candidates: merge and dedupe", () => {
	it("docker beats dns beats history, ports are unioned, used_by kept", () => {
		const merged = mergeCandidates([
			[item("web", "history", { ports: [80], used_by: 2, hint_port: 80 })],
			[item("web", "dns", { network: "net", ip: "172.18.0.3" })],
			[item("Web", "docker", { ports: [3000], state: "running", network: "npm_default" })],
		]);
		assert.equal(merged.length, 1);
		const [web] = merged;
		assert.equal(web.source, "docker");
		assert.equal(web.host, "Web");
		assert.deepEqual(web.ports, [80, 3000]);
		assert.equal(web.used_by, 2);
		assert.equal(web.state, "running");
		assert.equal(web.network, "npm_default");
		assert.equal(web.ip, "172.18.0.3");
		assert.equal(web.hint_port, 80);
	});

	it("orders by source, history by usage", () => {
		const merged = mergeCandidates([
			[item("z-hist", "history", { used_by: 1 }), item("a-hist", "history", { used_by: 5 })],
			[item("b-dns", "dns"), item("a-dns", "dns")],
			[item("c-docker", "docker")],
		]);
		assert.deepEqual(
			merged.map((i) => i.host),
			["c-docker", "a-dns", "b-dns", "a-hist", "z-hist"],
		);
	});

	it("caps the number of items", () => {
		const many = Array.from({ length: 700 }, (_, i) => item(`h${i}`, "dns"));
		assert.equal(mergeCandidates([many]).length, 500);
		assert.equal(mergeCandidates([many], 10).length, 10);
	});

	it("ignores junk", () => {
		assert.deepEqual(mergeCandidates([[null, { host: "" }, { source: "dns" }]]), []);
	});
});
