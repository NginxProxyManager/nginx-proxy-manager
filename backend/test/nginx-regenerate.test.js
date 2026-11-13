import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	auditMeta,
	createSingleFlight,
	HOST_TYPES,
	hostName,
	locationProblems,
	locationWarning,
	normaliseHostTypes,
	regenerateExitCode,
	runAudited,
	summarise,
	summariseFinal,
} from "../lib/nginx-regenerate.js";

describe("normaliseHostTypes", () => {
	it("defaults to all host types", () => {
		assert.deepEqual(normaliseHostTypes(), HOST_TYPES);
		assert.deepEqual(normaliseHostTypes([]), HOST_TYPES);
		assert.deepEqual(normaliseHostTypes(null), HOST_TYPES);
	});

	it("keeps known types in a stable order and drops unknown ones", () => {
		assert.deepEqual(normaliseHostTypes(["stream", "proxy_host", "nope"]), ["proxy_host", "stream"]);
	});
});

describe("hostName", () => {
	it("uses the first domain name", () => {
		assert.equal(
			hostName("proxy_host", { id: 3, domain_names: ["a.example.com", "b.example.com"] }),
			"a.example.com",
		);
	});

	it("uses the incoming port of a stream", () => {
		assert.equal(hostName("stream", { id: 4, incoming_port: 2222 }), "2222");
	});

	it("falls back to the id", () => {
		assert.equal(hostName("dead_host", { id: 5, domain_names: [] }), "#5");
	});
});

describe("locationWarning", () => {
	it("is null without broken locations", () => {
		assert.equal(locationWarning(undefined), null);
		assert.equal(
			locationWarning([
				{ path: "/a", status: "ok" },
				{ path: "/b", status: "disabled" },
			]),
			null,
		);
	});

	it("lists quarantined and unresolved locations", () => {
		const text = locationWarning([
			{ path: "/a", status: "ok" },
			{ path: "/b", status: "quarantined", message: "Disabled because nginx rejected it" },
			{ path: "/c", status: "unresolved", message: null },
		]);
		assert.equal(text, "/b: Disabled because nginx rejected it\n/c: unresolved");
	});
});

describe("locationProblems", () => {
	it("gives the UI the code and params of each broken location", () => {
		assert.deepEqual(locationProblems(undefined), []);
		assert.deepEqual(
			locationProblems([
				{ index: 0, path: "/a", status: "ok", code: null },
				{
					index: 1,
					path: "/b",
					status: "quarantined",
					mode: null,
					code: "rejected",
					params: { detail: "Unknown directive." },
					message: "Disabled because nginx rejected it: Unknown directive.",
				},
			]),
			[
				{
					index: 1,
					path: "/b",
					status: "quarantined",
					code: "rejected",
					params: { detail: "Unknown directive." },
					message: "Disabled because nginx rejected it: Unknown directive.",
				},
			],
		);
	});
});

describe("summarise", () => {
	it("counts online, offline and failed hosts and collects location warnings", () => {
		const summary = summarise([
			{ hostType: "proxy_host", row: { id: 1, domain_names: ["ok.example.com"] }, meta: { nginx_online: true } },
			{
				hostType: "proxy_host",
				row: { id: 2, domain_names: ["warn.example.com"] },
				meta: {
					nginx_online: true,
					nginx_locations: [{ path: "/x", status: "unresolved", message: "x does not resolve" }],
				},
			},
			{
				hostType: "redirection_host",
				row: { id: 3, domain_names: ["off.example.com"] },
				meta: {
					nginx_online: false,
					nginx_err: "unknown directive",
					nginx_details: { kind: "nginx_config", scope: "host", detail: "Unknown directive." },
				},
			},
			{ hostType: "stream", row: { id: 4, incoming_port: 9000 }, error: new Error("certificate missing") },
		]);
		assert.equal(summary.checked, 4);
		assert.equal(summary.regenerated, 2);
		assert.deepEqual(summary.offline, [
			{
				host_type: "redirection_host",
				id: 3,
				name: "off.example.com",
				error: "unknown directive",
				details: { kind: "nginx_config", scope: "host", detail: "Unknown directive." },
			},
		]);
		assert.deepEqual(summary.failed, [
			{ host_type: "stream", id: 4, name: "9000", error: "certificate missing", details: null },
		]);
		assert.deepEqual(summary.warnings, [
			{
				host_type: "proxy_host",
				id: 2,
				name: "warn.example.com",
				message: "/x: x does not resolve",
				locations: [
					{
						index: undefined,
						path: "/x",
						status: "unresolved",
						code: null,
						params: null,
						message: "x does not resolve",
					},
				],
			},
		]);
	});

	it("handles no hosts", () => {
		assert.deepEqual(summarise([]), {
			checked: 0,
			regenerated: 0,
			offline: [],
			failed: [],
			warnings: [],
			skipped: [],
		});
	});

	it("lists hosts left alone for a certificate request as skipped, not as checked", () => {
		const summary = summarise([
			{ hostType: "proxy_host", row: { id: 1, domain_names: ["ok.example.com"] }, meta: { nginx_online: true } },
			{ hostType: "proxy_host", row: { id: 2, domain_names: ["cert.example.com"] }, suspended: true },
		]);
		assert.equal(summary.checked, 1);
		assert.equal(summary.regenerated, 1);
		assert.equal(summary.skipped.length, 1);
		assert.equal(summary.skipped[0].id, 2);
		assert.equal(summary.skipped[0].name, "cert.example.com");
		assert.match(summary.skipped[0].message, /certificate request/);
	});
});

describe("createSingleFlight", () => {
	it("rejects a second call while the first one runs, then allows the next one", async () => {
		const flight = createSingleFlight(() => Object.assign(new Error("busy"), { status: 409 }));
		let release;
		const first = flight.run(() => new Promise((resolve) => (release = resolve)));
		assert.equal(flight.isRunning(), true);
		await assert.rejects(
			flight.run(async () => "second"),
			(err) => err.status === 409,
		);
		release("first");
		assert.equal(await first, "first");
		assert.equal(flight.isRunning(), false);
		assert.equal(await flight.run(async () => "third"), "third");
	});

	it("is free again after the call throws", async () => {
		const flight = createSingleFlight(() => new Error("busy"));
		await assert.rejects(
			flight.run(async () => {
				throw new Error("boom");
			}),
			/boom/,
		);
		assert.equal(flight.isRunning(), false);
	});
});

describe("summariseFinal", () => {
	const online = { nginx_online: true, nginx_locations: [] };
	const offline = (err) => ({ nginx_online: false, nginx_err: err });

	it("is summarise() when nothing changed after the hosts were configured", () => {
		const results = [{ hostType: "proxy_host", row: { id: 1, domain_names: ["a.test"] }, meta: online }];
		assert.deepEqual(summariseFinal(results, []), summarise(results));
		assert.deepEqual(summariseFinal(results), summarise(results));
	});

	it("reports a host as offline that the final test took offline after it was configured", () => {
		const results = [
			{ hostType: "proxy_host", row: { id: 10, domain_names: ["ten.test"] }, meta: online },
			{ hostType: "proxy_host", row: { id: 2, domain_names: ["two.test"] }, meta: online },
		];
		const summary = summariseFinal(results, [
			{ hostType: "proxy_host", row: { id: 10, domain_names: ["ten.test"], meta: offline("duplicate") } },
		]);
		assert.equal(summary.checked, 2);
		assert.equal(summary.regenerated, 1);
		assert.deepEqual(summary.offline, [
			{ host_type: "proxy_host", id: 10, name: "ten.test", error: "duplicate", details: null },
		]);
	});

	it("drops the warning of a host that went offline and keeps hosts that were repaired online", () => {
		const warn = { nginx_online: true, nginx_locations: [{ path: "/api", status: "quarantined", message: "bad" }] };
		const results = [
			{ hostType: "proxy_host", row: { id: 1, domain_names: ["a.test"] }, meta: warn },
			{ hostType: "proxy_host", row: { id: 2, domain_names: ["b.test"] }, meta: warn },
		];
		const summary = summariseFinal(results, [
			{ hostType: "proxy_host", row: { id: 1, domain_names: ["a.test"], meta: offline("broken") } },
			// repaired by a later heal: its final locations are fine
			{ hostType: "proxy_host", row: { id: 2, domain_names: ["b.test"], meta: online } },
		]);
		assert.equal(summary.regenerated, 1);
		assert.equal(summary.offline.length, 1);
		assert.deepEqual(summary.warnings, []);
	});

	it("moves a host whose config could not be generated to offline when its old config was taken offline", () => {
		const results = [
			{ hostType: "dead_host", row: { id: 3, domain_names: ["c.test"] }, error: new Error("no cert") },
		];
		const summary = summariseFinal(results, [
			{ hostType: "dead_host", row: { id: 3, domain_names: ["c.test"], meta: offline("old file broken") } },
		]);
		assert.deepEqual(summary.failed, []);
		assert.deepEqual(summary.offline, [
			{ host_type: "dead_host", id: 3, name: "c.test", error: "old file broken", details: null },
		]);
	});

	it("keeps a failed host failed when it is still online", () => {
		const results = [
			{ hostType: "dead_host", row: { id: 3, domain_names: ["c.test"] }, error: new Error("no cert") },
		];
		const summary = summariseFinal(results, [{ hostType: "dead_host", row: { id: 3, meta: online } }]);
		assert.equal(summary.failed.length, 1);
		assert.equal(summary.offline.length, 0);
	});

	it("adds hosts outside the selection that are offline now, without counting them as checked", () => {
		const results = [{ hostType: "proxy_host", row: { id: 1, domain_names: ["a.test"] }, meta: online }];
		const summary = summariseFinal(results, [
			{ hostType: "stream", row: { id: 4, incoming_port: 2222, meta: offline("bind failed") } },
			{ hostType: "stream", row: { id: 4, incoming_port: 2222, meta: offline("bind failed") } },
			{ hostType: "dead_host", row: { id: 5, domain_names: ["d.test"], meta: online } },
		]);
		assert.equal(summary.checked, 1);
		assert.equal(summary.regenerated, 1);
		assert.deepEqual(summary.offline, [
			{ host_type: "stream", id: 4, name: "2222", error: "bind failed", details: null },
		]);
	});
});

describe("auditMeta", () => {
	it("counts the summary", () => {
		assert.deepEqual(
			auditMeta(["stream"], {
				checked: 3,
				regenerated: 1,
				offline: [{}],
				failed: [{}],
				warnings: [],
				skipped: [{}],
				duration_ms: 5,
			}),
			{
				host_types: ["stream"],
				checked: 3,
				regenerated: 1,
				offline: 1,
				failed: 1,
				warnings: 0,
				skipped: 1,
				duration_ms: 5,
			},
		);
	});

	it("records the error, also without a summary", () => {
		assert.deepEqual(auditMeta(undefined, null, new Error("reload failed")), {
			host_types: null,
			checked: null,
			regenerated: null,
			offline: null,
			failed: null,
			warnings: null,
			skipped: null,
			duration_ms: null,
			error: "reload failed",
		});
	});
});

describe("runAudited", () => {
	const summary = { checked: 2, regenerated: 2, offline: [], failed: [], warnings: [], duration_ms: 1 };

	it("audits a successful run and returns its summary", async () => {
		const audits = [];
		const result = await runAudited({ run: async () => summary, audit: async (m) => audits.push(m) });
		assert.equal(result, summary);
		assert.equal(audits.length, 1);
		assert.equal(audits[0].checked, 2);
		assert.equal(audits[0].error, undefined);
	});

	it("audits a run that failed half way with its partial summary and the error, then rethrows", async () => {
		const audits = [];
		const failure = Object.assign(new Error("Too many broken host configs"), {
			regenerateSummary: Object.assign({}, summary, { regenerated: 1, offline: [{ id: 1 }] }),
		});
		await assert.rejects(
			runAudited({
				hostTypes: ["proxy_host"],
				run: async () => {
					throw failure;
				},
				audit: async (m) => audits.push(m),
			}),
			(err) => err === failure,
		);
		assert.equal(audits.length, 1);
		assert.equal(audits[0].error, "Too many broken host configs");
		assert.equal(audits[0].offline, 1);
		assert.deepEqual(audits[0].host_types, ["proxy_host"]);
	});

	it("does not fail the run when the audit write fails", async () => {
		const auditErrors = [];
		const result = await runAudited({
			run: async () => summary,
			audit: async () => {
				throw new Error("db down");
			},
			onAuditError: (err) => auditErrors.push(err.message),
		});
		assert.equal(result, summary);
		assert.deepEqual(auditErrors, ["db down"]);
	});
});

describe("regenerateExitCode", () => {
	it("fails the script when hosts could not be regenerated, not for hosts taken offline", () => {
		assert.equal(regenerateExitCode({ failed: [], offline: [] }), 0);
		assert.equal(regenerateExitCode({ failed: [], offline: [{ id: 1 }] }), 0);
		assert.equal(regenerateExitCode({ failed: [{ id: 2 }], offline: [] }), 1);
	});
});
