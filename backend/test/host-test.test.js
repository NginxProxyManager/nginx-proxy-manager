import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	buildAsideWarnings,
	buildTestResult,
	buildTestTargets,
	checkTestTargets,
	hasQuarantinedLocation,
	MAX_TEST_TARGETS,
	mergeTargetResults,
	takePendingCertificate,
} from "../lib/host-test.js";
import { CHECK_BUDGET_PER_MINUTE } from "../lib/upstream/check-budget.js";
import { createRateLimiter } from "../lib/upstream/rate-limit.js";

describe("buildTestTargets", () => {
	it("checks the main target and the enabled locations of a proxy host, also when it is disabled", () => {
		const targets = buildTestTargets("proxy_host", {
			id: "npm-dry-run",
			enabled: false,
			forward_host: "app",
			forward_port: 8080,
			forward_scheme: "http",
			locations: [
				{ path: "/api", forward_host: "api/v1", forward_port: 9000, forward_scheme: "https" },
				{ path: "/off", forward_host: "off", forward_port: 1, enabled: false },
				{ path: "/var", forward_host: "$backend", forward_port: 80 },
			],
		});
		assert.deepEqual(targets, [
			{ location_index: null, host: "app", port: 8080, scheme: "http" },
			{ location_index: 0, path: "/api", host: "api", port: 9000, scheme: "https" },
		]);
	});

	it("checks the target of a TCP stream only", () => {
		assert.deepEqual(
			buildTestTargets("stream", {
				forwarding_host: "db",
				forwarding_port: 5432,
				tcp_forwarding: true,
			}),
			[{ location_index: null, host: "db", port: 5432, scheme: null }],
		);
		assert.deepEqual(
			buildTestTargets("stream", { forwarding_host: "dns", forwarding_port: 53, tcp_forwarding: false }),
			[],
		);
	});

	it("has nothing to check for redirection and 404 hosts", () => {
		assert.deepEqual(buildTestTargets("redirection_host", { forward_domain_name: "example.com" }), []);
		assert.deepEqual(buildTestTargets("dead_host", {}), []);
		assert.deepEqual(buildTestTargets("proxy_host", null), []);
	});

	it("checks at most 20 targets", () => {
		const locations = Array.from({ length: 30 }, (_, i) => ({
			path: `/p${i}`,
			forward_host: `h${i}`,
			forward_port: 80,
		}));
		const targets = buildTestTargets("proxy_host", { forward_host: "app", forward_port: 80, locations });
		assert.equal(targets.length, 20);
	});
});

describe("mergeTargetResults", () => {
	it("adds the location of each target to its result", () => {
		const merged = mergeTargetResults(
			[
				{ location_index: null, host: "app", port: 80 },
				{ location_index: 1, path: "/api", host: "api", port: 81 },
			],
			[
				{ host: "app", port: 80, ok: true, code: "ok" },
				{ host: "api", port: 81, ok: false, code: "tcp_refused" },
			],
		);
		assert.deepEqual(merged, [
			{ host: "app", port: 80, ok: true, code: "ok", location_index: null, path: null },
			{ host: "api", port: 81, ok: false, code: "tcp_refused", location_index: 1, path: "/api" },
		]);
	});
});

describe("buildTestResult", () => {
	it("is ok when nginx accepts the host", () => {
		const result = buildTestResult({
			meta: {
				nginx_online: true,
				nginx_locations: [{ index: 0, path: "/a", status: "unresolved", mode: "dynamic", message: "x" }],
			},
			error: null,
			locations: null,
		});
		assert.equal(result.ok, true);
		assert.equal(result.nginx_online, true);
		assert.equal(result.nginx_err, null);
		assert.equal(result.nginx_details, null);
		assert.equal(result.nginx_locations.length, 1);
		assert.deepEqual(result.upstreams, []);
		assert.deepEqual(result.warnings, []);
	});

	it("is not ok when a location would be quarantined, the host stays online", () => {
		const result = buildTestResult({
			meta: {
				nginx_online: true,
				nginx_locations: [{ index: 0, path: "/a", status: "quarantined", mode: null, message: "bad" }],
			},
			error: null,
		});
		assert.equal(result.ok, false);
		assert.equal(result.nginx_online, true);
	});

	it("reports a host level rejection with its details and the location states", () => {
		const error = new Error("Advanced configuration: unknown directive.");
		error.details = { kind: "nginx_config", scope: "host" };
		const result = buildTestResult({
			meta: null,
			error,
			locations: [{ index: 0, path: "/a", status: "ok", mode: "static", message: null }],
		});
		assert.equal(result.ok, false);
		assert.equal(result.nginx_online, false);
		assert.equal(result.nginx_err, "Advanced configuration: unknown directive.");
		assert.deepEqual(result.nginx_details, { kind: "nginx_config", scope: "host" });
		assert.equal(result.nginx_locations.length, 1);
	});

	it("reports a render failure without details", () => {
		const result = buildTestResult({ meta: null, error: new Error("template error"), locations: null });
		assert.equal(result.ok, false);
		assert.equal(result.nginx_details, null);
		assert.deepEqual(result.nginx_locations, []);
	});
});

describe("hasQuarantinedLocation", () => {
	it("only counts quarantined locations", () => {
		assert.equal(hasQuarantinedLocation(undefined), false);
		assert.equal(hasQuarantinedLocation([{ status: "disabled" }, { status: "unresolved" }]), false);
		assert.equal(hasQuarantinedLocation([{ status: "ok" }, { status: "quarantined" }]), true);
	});
});

describe("checkTestTargets", () => {
	const targets = (count) =>
		Array.from({ length: count }, (_, i) => ({
			location_index: i ? i - 1 : null,
			host: `h${i}`,
			port: 80 + i,
			scheme: "http",
		}));

	// The budget of POST /upstreams/check, the test charges the same one
	const setup = () => {
		let now = 0;
		const budget = createRateLimiter({ limit: CHECK_BUDGET_PER_MINUTE, windowMs: 60 * 1000, now: () => now });
		const probed = [];
		const opts = {
			enabled: true,
			consume: (units) => budget.consume("1", units),
			check: async (list, checkOpts) => {
				probed.push(...list);
				return list.map((t) => ({
					host: t.host,
					port: t.port,
					ok: true,
					code: checkOpts.enabled ? "ok" : "disabled",
				}));
			},
		};
		return { budget, probed, opts, tick: (ms) => (now += ms) };
	};

	it("charges one unit per target, so tests can't probe more than /upstreams/check allows", async () => {
		const { budget, probed, opts } = setup();
		let rateLimitedTests = 0;
		// 30 tests (the request limit) of hosts with the maximum number of targets
		for (let i = 0; i < 30; i++) {
			const { rateLimited } = await checkTestTargets(targets(MAX_TEST_TARGETS), opts);
			if (rateLimited !== null) {
				rateLimitedTests++;
			}
		}
		assert.equal(probed.length, CHECK_BUDGET_PER_MINUTE);
		assert.equal(rateLimitedTests, 30 - CHECK_BUDGET_PER_MINUTE / MAX_TEST_TARGETS);
		// ... and /upstreams/check has nothing left either
		assert.equal(budget.consume("1", 1).ok, false);
	});

	it("reports the targets as rate_limited without probing when the budget is used up", async () => {
		const { budget, probed, opts, tick } = setup();
		assert.equal(budget.consume("1", CHECK_BUDGET_PER_MINUTE - 1).ok, true);

		const { results, rateLimited } = await checkTestTargets(targets(2), opts);
		assert.equal(probed.length, 0);
		assert.ok(rateLimited >= 1 && rateLimited <= 60);
		assert.deepEqual(results[0], {
			host: "h0",
			port: 80,
			scheme: "http",
			ok: false,
			code: "rate_limited",
			message: `Reachability was not checked: too many upstream checks in the last minute. Try again in ${rateLimited} seconds.`,
			addresses: [],
			resolver_ok: null,
			system_ok: null,
			ms: null,
		});
		assert.equal(results[1].code, "rate_limited");

		// what is left still gets probed
		const one = await checkTestTargets(targets(1), opts);
		assert.equal(one.rateLimited, null);
		assert.equal(one.results[0].code, "ok");

		tick(60 * 1000);
		assert.equal((await checkTestTargets(targets(2), opts)).rateLimited, null);
		assert.equal(probed.length, 3);
	});

	it("costs nothing when checks are disabled or there is nothing to check", async () => {
		const { budget, opts } = setup();
		assert.equal(budget.consume("1", CHECK_BUDGET_PER_MINUTE).ok, true);
		const disabled = await checkTestTargets(targets(3), Object.assign({}, opts, { enabled: false }));
		assert.equal(disabled.rateLimited, null);
		assert.deepEqual(
			disabled.results.map((r) => r.code),
			["disabled", "disabled", "disabled"],
		);
		assert.deepEqual(await checkTestTargets([], opts), { results: [], rateLimited: null });
	});
});

describe("buildAsideWarnings", () => {
	it("names the other broken host only to users who can see it", async () => {
		const aside = [
			{
				host_type: "proxy_host",
				host_id: 4,
				message: "Nginx rejects the current configuration of Proxy host #4.",
			},
			{ host_type: "stream", host_id: 9, message: "Nginx rejects the current configuration of Stream #9." },
		];
		const warnings = await buildAsideWarnings(aside, async (other) => other.host_type === "proxy_host");
		assert.deepEqual(warnings, [
			{
				code: "other_host_broken",
				message: "Nginx rejects the current configuration of Proxy host #4. Saving would repair or disable it.",
				host_type: "proxy_host",
				host_id: 4,
			},
			{
				code: "other_host_broken",
				message:
					"Nginx rejects the current configuration of another host. Saving would repair or disable that host. Please ask an administrator to check it.",
				host_type: null,
				host_id: null,
			},
		]);
		assert.deepEqual(await buildAsideWarnings([], async () => true), []);
	});
});

describe("takePendingCertificate", () => {
	it("checks the host without SSL when a new certificate is requested", () => {
		const input = { certificate_id: "new", ssl_forced: true };
		assert.deepEqual(
			takePendingCertificate(input).map((w) => w.code),
			["certificate_pending"],
		);
		// 0, not deleted: merged over a stored row, a missing key would bring back the stored certificate
		assert.equal(input.certificate_id, 0);
		assert.ok(Object.hasOwn(input, "certificate_id"));
	});

	it("leaves other certificates alone", () => {
		for (const certificate_id of [0, 3, undefined]) {
			const input = { certificate_id };
			assert.deepEqual(takePendingCertificate(input), []);
			assert.equal(input.certificate_id, certificate_id);
		}
	});
});
