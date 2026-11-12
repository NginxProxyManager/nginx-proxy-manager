import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildHealthTargets, HealthMonitor, visibilityFilter } from "../lib/upstream/health.js";

const rows = {
	proxyHosts: [
		{
			id: 12,
			owner_user_id: 1,
			enabled: true,
			forward_host: "app",
			forward_port: 80,
			forward_scheme: "http",
			locations: [
				{ path: "/api", forward_host: "api/v1", forward_port: 8080, forward_scheme: "http" },
				{ path: "/off", forward_host: "off", forward_port: 1, enabled: false },
				{ path: "/x", forward_host: "app", forward_port: 80 },
			],
		},
		{ id: 13, owner_user_id: 2, enabled: true, forward_host: "other", forward_port: 81, locations: [] },
		{ id: 14, owner_user_id: 1, enabled: false, forward_host: "disabled", forward_port: 1, locations: [] },
	],
	streams: [
		{ id: 3, owner_user_id: 1, enabled: true, tcp_forwarding: true, forwarding_host: "db", forwarding_port: 5432 },
		{ id: 4, owner_user_id: 1, enabled: true, tcp_forwarding: false, forwarding_host: "dns", forwarding_port: 53 },
	],
};

const fakeCheck = (calls) => async (target) => {
	calls.push(`${target.host}:${target.port}`);
	if (target.host === "api") {
		return { ok: false, code: "tcp_refused", message: "refused", ms: null };
	}
	return { ok: true, code: "ok", message: "fine", ms: 1 };
};

describe("health: targets", () => {
	it("includes main target, enabled locations and TCP streams", () => {
		const targets = buildHealthTargets(rows);
		assert.deepEqual(
			targets.map((t) => `${t.type}:${t.id}:${t.targets.length}`),
			["proxy_host:12:3", "proxy_host:13:1", "stream:3:1"],
		);
		const loc = targets[0].targets[1];
		assert.deepEqual(loc, {
			location_index: 0,
			path: "/api",
			host: "api",
			port: 8080,
			scheme: "http",
			resolver: false,
		});
		assert.equal(targets[0].targets[2].location_index, 2, "index is the position in locations[]");
	});
});

describe("health: variable upstreams", () => {
	it("skips forward hosts that are nginx variables", () => {
		const targets = buildHealthTargets({
			proxyHosts: [
				{
					id: 20,
					owner_user_id: 1,
					enabled: true,
					forward_host: "$server",
					forward_port: 80,
					locations: [
						{ path: "/v", forward_host: "$backend", forward_port: 8080 },
						{ path: "/a", forward_host: "app", forward_port: 80 },
						{ path: "/s", forward_host: "app-$stage/api", forward_port: 80 },
					],
				},
				{ id: 21, owner_user_id: 1, enabled: true, forward_host: "$only", forward_port: 80, locations: [] },
			],
			streams: [
				{
					id: 5,
					owner_user_id: 1,
					enabled: true,
					tcp_forwarding: true,
					forwarding_host: "$up",
					forwarding_port: 1,
				},
			],
		});
		assert.deepEqual(targets, [
			{
				type: "proxy_host",
				id: 20,
				owner_user_id: 1,
				targets: [{ location_index: 1, path: "/a", host: "app", port: 80, scheme: undefined, resolver: false }],
			},
		]);
	});
});

describe("health: resolver-only upstreams", () => {
	const mismatchCheck = async (target) => ({
		ok: true,
		code: "resolver_mismatch",
		message: `${target.host} only via /etc/hosts`,
		ms: 1,
	});

	it("marks the targets nginx resolves per request: the main target and dynamic locations", () => {
		const [host] = buildHealthTargets({
			proxyHosts: [
				{
					id: 30,
					owner_user_id: 1,
					enabled: true,
					forward_host: "app",
					forward_port: 80,
					locations: [
						{ path: "/s", forward_host: "st", forward_port: 80 },
						{ path: "/d", forward_host: "dy", forward_port: 80 },
					],
					// as read by a select without the model's JSON parsing
					meta: JSON.stringify({
						nginx_locations: [
							{ index: 0, path: "/s", status: "ok", mode: "static" },
							{ index: 1, path: "/d", status: "ok", mode: "dynamic" },
						],
					}),
				},
			],
		});
		assert.deepEqual(
			host.targets.map((t) => [t.location_index, t.resolver]),
			[
				[null, true],
				[0, false],
				[1, true],
			],
		);
	});

	it("counts a resolver_mismatch of the main target as unhealthy, of a static location or a stream as healthy", async () => {
		const monitor = new HealthMonitor({
			getInterval: () => 60,
			loadRows: async () => ({
				proxyHosts: [
					{
						id: 31,
						owner_user_id: 1,
						enabled: true,
						forward_host: "app",
						forward_port: 80,
						locations: [{ path: "/s", forward_host: "app", forward_port: 80 }],
						meta: { nginx_locations: [{ index: 0, path: "/s", status: "ok", mode: "static" }] },
					},
				],
				streams: [
					{ id: 6, owner_user_id: 1, enabled: true, tcp_forwarding: true, forwarding_host: "db", forwarding_port: 1 },
				],
			}),
			check: mismatchCheck,
		});
		await monitor.runOnce();
		const all = monitor.snapshot({ proxy_host: () => true, stream: () => true });
		const h31 = all.hosts.proxy_host["31"];
		assert.equal(h31.ok, false);
		assert.deepEqual(
			h31.targets.map((t) => [t.location_index, t.ok, t.code]),
			[
				[null, false, "resolver_mismatch"],
				[0, true, "resolver_mismatch"],
			],
			"same probe (deduped), interpreted per target",
		);
		assert.match(h31.targets[0].message, /nginx resolves this upstream per request/);
		assert.equal(all.hosts.stream["6"].ok, true);
	});
});

describe("health: variable forward paths", () => {
	const mismatchCheck = async (target) => ({
		ok: true,
		code: "resolver_mismatch",
		message: `${target.host} only via /etc/hosts`,
		ms: 1,
	});

	it("a static location with a variable forward path is resolved per request", async () => {
		const row = {
			id: 40,
			owner_user_id: 1,
			enabled: true,
			forward_host: "$up",
			forward_port: 80,
			locations: [
				{ path: "/api", forward_host: "hosts-only", forward_port: 80, forward_path: "/api/$arg_id" },
				{ path: "/emb", forward_host: "hosts-only/v1/$arg_id", forward_port: 80 },
				{ path: "/plain", forward_host: "hosts-only", forward_port: 80, forward_path: "/api" },
				// the path in the forward host wins over the forward path field, as when rendering
				{ path: "/won", forward_host: "hosts-only/v1", forward_port: 80, forward_path: "/$arg_id" },
			],
			// the renderer keeps such locations static
			meta: {
				nginx_locations: [0, 1, 2, 3].map((index) => ({ index, status: "ok", mode: "static" })),
			},
		};
		const [host] = buildHealthTargets({ proxyHosts: [row] });
		assert.deepEqual(
			host.targets.map((t) => [t.location_index, t.resolver, t.variable_path === true]),
			[
				[0, true, true],
				[1, true, true],
				[2, false, false],
				[3, false, false],
			],
		);

		const monitor = new HealthMonitor({
			getInterval: () => 60,
			loadRows: async () => ({ proxyHosts: [row] }),
			check: mismatchCheck,
		});
		await monitor.runOnce();
		const h40 = monitor.snapshot({ proxy_host: () => true }).hosts.proxy_host["40"];
		assert.equal(h40.ok, false, "requests to the variable paths fail with a 502");
		assert.deepEqual(
			h40.targets.map((t) => [t.location_index, t.ok]),
			[
				[0, false],
				[1, false],
				[2, true],
				[3, true],
			],
		);
	});
});

describe("health: monitor", () => {
	it("runs a round, dedupes host:port, and filters the snapshot", async () => {
		const calls = [];
		const monitor = new HealthMonitor({
			getInterval: () => 60,
			loadRows: async () => rows,
			check: fakeCheck(calls),
		});
		assert.equal(monitor.snapshot({ proxy_host: () => true, stream: () => true }).checked_at, null);

		await monitor.runOnce();
		assert.deepEqual(calls.sort(), ["api:8080", "app:80", "db:5432", "other:81"]);

		const all = monitor.snapshot({ proxy_host: () => true, stream: () => true });
		assert.equal(all.enabled, true);
		assert.equal(all.interval, 60);
		assert.ok(all.checked_at);
		assert.deepEqual(Object.keys(all.hosts.proxy_host).sort(), ["12", "13"]);
		const h12 = all.hosts.proxy_host["12"];
		assert.equal(h12.ok, false);
		assert.equal(h12.owner_user_id, undefined, "owner is never exposed");
		assert.deepEqual(h12.targets[0], {
			location_index: null,
			host: "app",
			port: 80,
			ok: true,
			code: "ok",
			message: "fine",
			ms: 1,
		});
		assert.equal(h12.targets[1].path, "/api");
		assert.equal(h12.targets[1].code, "tcp_refused");
		assert.equal(all.hosts.stream["3"].ok, true);

		const own = monitor.snapshot({ proxy_host: (owner) => owner === 1, stream: null });
		assert.deepEqual(Object.keys(own.hosts.proxy_host), ["12"]);
		assert.deepEqual(own.hosts.stream, {});
	});

	it("filters by the visibility of the list endpoints, with explicitly shared proxy hosts", async () => {
		const monitor = new HealthMonitor({
			getInterval: () => 60,
			loadRows: async () => rows,
			check: fakeCheck([]),
		});
		await monitor.runOnce();
		const ids = (filter) => Object.keys(monitor.snapshot({ proxy_host: filter, stream: null }).hosts.proxy_host);

		assert.deepEqual(ids(visibilityFilter(true, 2)).sort(), ["12", "13"]);
		assert.deepEqual(ids(visibilityFilter({ permission_visibility: "all" }, 2)).sort(), ["12", "13"]);
		assert.deepEqual(ids(visibilityFilter({ permission_visibility: "user" }, 2)), ["13"]);
		assert.deepEqual(ids(visibilityFilter({ permission_visibility: "user" }, 2, [12])).sort(), ["12", "13"]);
		assert.deepEqual(ids(visibilityFilter({ permission_visibility: "user" }, 3, ["12"])), ["12"]);
		assert.deepEqual(ids(visibilityFilter({ permission_visibility: "user" }, 3, null)), []);
	});

	it("shares concurrent rounds and survives failures", async () => {
		let loads = 0;
		const monitor = new HealthMonitor({
			getInterval: () => 60,
			loadRows: async () => {
				loads++;
				throw new Error("db down");
			},
			check: async () => ({ ok: true }),
		});
		await Promise.all([monitor.runOnce(), monitor.runOnce()]);
		assert.equal(loads, 1);
		assert.equal(monitor.checkedAt, null);
	});

	it("does not start when disabled", () => {
		const off = new HealthMonitor({ getInterval: () => 0, loadRows: async () => ({}), check: async () => ({}) });
		assert.equal(off.start(), false);
		const killed = new HealthMonitor({
			getInterval: () => 60,
			isEnabled: () => false,
			loadRows: async () => ({}),
			check: async () => ({}),
		});
		assert.equal(killed.start(), false);
		assert.equal(killed.snapshot().enabled, false);
	});

	it("schedules rounds and stops cleanly", async () => {
		let rounds = 0;
		const monitor = new HealthMonitor({
			getInterval: () => 60,
			firstRunDelayMs: 1,
			loadRows: async () => {
				rounds++;
				return {};
			},
			check: async () => ({}),
		});
		assert.equal(monitor.start(), true);
		await new Promise((r) => setTimeout(r, 30));
		monitor.stop();
		assert.equal(rounds, 1);
		assert.equal(monitor.timer, null);
	});
});

describe("health: invalid stored ports", () => {
	it("skips targets whose port is not 1-65535", () => {
		const out = buildHealthTargets({
			proxyHosts: [
				{
					id: 1,
					owner_user_id: 1,
					enabled: true,
					forward_host: "app",
					forward_port: "x",
					locations: [
						{ path: "/a", forward_host: "a", forward_port: "x" },
						{ path: "/b", forward_host: "b", forward_port: 70000 },
						{ path: "/c", forward_host: "c", forward_port: "8080" },
					],
				},
			],
			streams: [
				{
					id: 2,
					owner_user_id: 1,
					enabled: true,
					tcp_forwarding: true,
					forwarding_host: "s",
					forwarding_port: "1.5",
				},
			],
		});
		assert.equal(out.length, 1);
		assert.deepEqual(
			out[0].targets.map((t) => [t.host, t.port]),
			[["c", 8080]],
		);
		for (const target of out[0].targets) {
			assert.ok(Number.isInteger(target.port));
		}
	});
});
