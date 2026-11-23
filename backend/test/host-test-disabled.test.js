import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { access, db, load, ts } from "./support/backend.js";

// A config test of a disabled host checks it as it runs once enabled (a disabled host renders an empty config,
// which nginx -t always accepts), without enabling the stored host.
const internalNginx = await load("internal/nginx.js");
const internalHostTest = await load("internal/host-test.js");

const original = {};
const dryRuns = [];

before(() => {
	original.dryRun = internalNginx.dryRun;
	internalNginx.dryRun = async (_model, hostType, host) => {
		dryRuns.push({ hostType, host: structuredClone(host) });
		return { meta: { nginx_online: true, nginx_err: null }, error: null, locations: null, aside: [] };
	};
});

after(async () => {
	internalNginx.dryRun = original.dryRun;
	await db.destroy();
});

const insertDisabledProxyHost = async (id) => {
	await db("proxy_host").insert({
		id,
		owner_user_id: 1,
		certificate_id: 0,
		enabled: 0,
		meta: "{}",
		domain_names: JSON.stringify([`disabled-${id}.example.com`]),
		forward_scheme: "http",
		forward_host: "127.0.0.1",
		forward_port: 80,
		access_list_id: 0,
		advanced_config: "bogus_directive on;",
		locations: "[]",
		...ts,
	});
};

describe("config test of a disabled host", () => {
	it("renders a stored disabled host as enabled and leaves the row disabled", async () => {
		await insertDisabledProxyHost(501);
		dryRuns.length = 0;

		await internalHostTest.test(access, "proxy_host", {
			id: 501,
			domain_names: ["disabled-501.example.com"],
			forward_scheme: "http",
			forward_host: "127.0.0.1",
			forward_port: 80,
			advanced_config: "bogus_directive on;",
		});

		assert.equal(dryRuns.length, 1);
		assert.equal(dryRuns[0].host.id, 501);
		assert.equal(dryRuns[0].host.enabled, true);
		assert.equal(dryRuns[0].host.advanced_config, "bogus_directive on;");
		const row = await db("proxy_host").where("id", 501).first();
		assert.equal(row.enabled, 0);
	});

	it("renders a new host as enabled, also when the payload says enabled: false", async () => {
		dryRuns.length = 0;

		await internalHostTest.test(access, "proxy_host", {
			domain_names: ["disabled-new.example.com"],
			forward_scheme: "http",
			forward_host: "127.0.0.1",
			forward_port: 80,
			enabled: false,
		});

		assert.equal(dryRuns.length, 1);
		assert.equal(dryRuns[0].host.id, internalNginx.DRY_RUN_ID);
		assert.equal(dryRuns[0].host.enabled, true);
	});

	it("does not change the stored row object it builds on", async () => {
		const row = { id: 7, enabled: false, meta: {}, domain_names: ["b.example.com", "a.example.com"] };
		const type = { get: async () => row, expand: [], defaults: {} };

		const host = await internalHostTest.buildHost(access, type, "dead_host", 7, { advanced_config: "" });

		assert.equal(host.enabled, true);
		assert.equal(row.enabled, false);
		assert.deepEqual(row.domain_names, ["b.example.com", "a.example.com"]);
	});
});
