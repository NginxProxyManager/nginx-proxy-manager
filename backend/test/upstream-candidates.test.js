import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	buildHistoryCandidates,
	excludeHidden,
	markExistingHosts,
	mergeCandidates,
} from "../lib/upstream/candidates.js";

const item = (host, source, extra = {}) => ({
	host,
	kind: source === "docker" ? "container" : source,
	owner: null,
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

describe("candidates: npm.hide for DNS discovery", () => {
	const hidden = { hosts: new Set(["hidden-db"]), ips: new Set(["172.18.0.5"]) };

	it("drops DNS items of hidden containers by name or by IP", () => {
		const dns = [
			item("Hidden-DB", "dns", { ip: "172.18.0.7" }),
			item("proj-hidden-db-1", "dns", { ip: "172.18.0.5" }),
			item("web", "dns", { ip: "172.18.0.3" }),
		];
		assert.deepEqual(
			excludeHidden(dns, hidden).map((i) => i.host),
			["web"],
		);
	});

	it("keeps docker and history items and everything when the hidden containers are unknown", () => {
		const items = [
			item("hidden-db", "history", { used_by: 1 }),
			item("hidden-db", "docker"),
			item("hidden-db", "dns"),
		];
		assert.deepEqual(
			excludeHidden(items, hidden).map((i) => i.source),
			["history", "docker"],
		);
		assert.equal(excludeHidden(items, null).length, 3);
		assert.equal(excludeHidden(items, { hosts: new Set(), ips: new Set() }).length, 3);
	});

	it("the merged list no longer brings a hidden container back through DNS discovery", () => {
		const merged = mergeCandidates([
			[item("web", "docker")],
			excludeHidden([item("hidden-db", "dns", { ip: "172.18.0.5" }), item("web", "dns")], hidden),
		]);
		assert.deepEqual(
			merged.map((i) => i.host),
			["web"],
		);
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

describe("candidates: label suggestions", () => {
	const suggestion = (domains) => ({
		domain_names: domains,
		forward_scheme: "http",
		forward_host: "blog",
		forward_port: 2368,
		allow_websocket_upgrade: false,
		block_exploits: false,
		caching_enabled: false,
		http2_support: false,
		ignored_domains: [],
		existing_host_id: null,
		existing_host_type: null,
	});

	it("keeps the docker suggestion when merging", () => {
		const s = suggestion(["blog.example.com"]);
		const merged = mergeCandidates([
			[item("blog", "history", { used_by: 1 }), item("blog", "docker", { suggestion: s })],
		]);
		assert.equal(merged.length, 1);
		assert.deepEqual(merged[0].suggestion, s);
		assert.equal(merged[0].used_by, 1);
		const plain = mergeCandidates([[item("db", "dns")]]);
		assert.equal("suggestion" in plain[0], false);
	});

	it("marks suggestions whose domain is already served, without changing the input", () => {
		const s = suggestion(["www.blog.example.com", "blog.example.com"]);
		const items = [
			item("blog", "docker", { suggestion: s }),
			item("other", "docker", { suggestion: suggestion([]) }),
		];
		const out = markExistingHosts(items, {
			proxyHosts: [
				{ id: 4, domain_names: ["shop.example.com"] },
				{ id: 9, domain_names: ["Blog.Example.com"] },
				{ id: 10, domain_names: null },
			],
		});
		assert.equal(out[0].suggestion.existing_host_id, 9);
		assert.equal(out[0].suggestion.existing_host_type, "proxy_host");
		assert.equal(out[1].suggestion.existing_host_id, null);
		assert.equal(out[1].suggestion.existing_host_type, null);
		// the discovery cache is shared between users
		assert.equal(s.existing_host_id, null);
		assert.notEqual(out[0].suggestion, s);
		assert.notEqual(out[0].suggestion.ignored_domains, s.ignored_domains);
		assert.deepEqual(markExistingHosts([item("x", "dns")], {}), [item("x", "dns")]);
		assert.equal(markExistingHosts(items, undefined)[0].suggestion.existing_host_id, null);
	});

	it("reports redirection and 404 hosts that already use a domain, proxy hosts first", () => {
		const items = [
			item("a", "docker", { suggestion: suggestion(["a.example.com"]) }),
			item("b", "docker", { suggestion: suggestion(["b.example.com"]) }),
			item("c", "docker", { suggestion: suggestion(["b.example.com", "c.example.com", "a.example.com"]) }),
			item("d", "docker", { suggestion: suggestion(["d.example.com"]) }),
		];
		const out = markExistingHosts(items, {
			proxyHosts: [{ id: 1, domain_names: ["c.example.com"] }],
			redirectionHosts: [{ id: 2, domain_names: ["A.example.com"] }],
			deadHosts: [
				{ id: 3, domain_names: ["b.example.com"] },
				{ id: 4, domain_names: ["a.example.com"] },
			],
		});
		const got = out.map((i) => [i.suggestion.existing_host_type, i.suggestion.existing_host_id]);
		assert.deepEqual(got, [
			["redirection_host", 2],
			["dead_host", 3],
			["proxy_host", 1],
			[null, null],
		]);
	});
});
