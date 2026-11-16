import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { access, db, load, ts, userAccess } from "./support/backend.js";

// Users who aren't admins may not change advanced configs. A config test applies the same rule as a save, so
// that it can't run arbitrary advanced config through nginx -t: a 403 before the dry run.
const errs = await load("lib/error.js");
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

beforeEach(() => {
	dryRuns.length = 0;
});

const location = (path, advanced_config, extra = {}) => ({
	path,
	forward_scheme: "http",
	forward_host: "app",
	forward_port: 80,
	...(typeof advanced_config === "undefined" ? {} : { advanced_config }),
	...extra,
});

let nextId = 700;
const insertProxyHost = async ({ advanced_config = "", locations = [] } = {}) => {
	const id = nextId++;
	await db("proxy_host").insert({
		id,
		owner_user_id: 1,
		certificate_id: 0,
		enabled: 1,
		meta: "{}",
		domain_names: JSON.stringify([`adv-${id}.example.com`]),
		forward_scheme: "http",
		forward_host: "app",
		forward_port: 80,
		access_list_id: 0,
		advanced_config,
		locations: JSON.stringify(locations),
		...ts,
	});
	return id;
};

const proxyPayload = (extra = {}) => ({
	domain_names: [`adv-new-${nextId++}.example.com`],
	forward_scheme: "http",
	forward_host: "app",
	forward_port: 80,
	...extra,
});

const user = () => userAccess({ userId: 1 });

const denied = async (promise) => {
	await assert.rejects(promise, (err) => {
		assert.ok(err instanceof errs.PermissionError, `expected a PermissionError, got ${err?.name}`);
		assert.equal(err.status, 403);
		return true;
	});
	assert.equal(dryRuns.length, 0, "nginx -t never ran");
};

describe("config test: advanced config of users who aren't admins", () => {
	it("refuses a new host with an advanced config", async () => {
		await denied(
			internalHostTest.test(user(), "proxy_host", proxyPayload({ advanced_config: "bogus_directive on;" })),
		);
		await denied(
			internalHostTest.test(user(), "redirection_host", {
				domain_names: ["adv-redirect.example.com"],
				forward_scheme: "auto",
				forward_domain_name: "example.com",
				forward_http_code: 301,
				advanced_config: "return 200;",
			}),
		);
		await denied(
			internalHostTest.test(user(), "dead_host", {
				domain_names: ["adv-dead.example.com"],
				advanced_config: "return 200;",
			}),
		);
	});

	it("refuses a new proxy host with a location advanced config", async () => {
		await denied(
			internalHostTest.test(
				user(),
				"proxy_host",
				proxyPayload({ locations: [location("/a", ""), location("/b", "expires 1d;")] }),
			),
		);
	});

	it("tests a new host without advanced config", async () => {
		await internalHostTest.test(
			user(),
			"proxy_host",
			proxyPayload({ advanced_config: "  ", locations: [location("/a", "")] }),
		);
		assert.equal(dryRuns.length, 1);
	});

	it("refuses a changed advanced config of a saved host, tests an unchanged one", async () => {
		const id = await insertProxyHost({ advanced_config: "add_header X-A 1;" });
		await denied(internalHostTest.test(user(), "proxy_host", { id, advanced_config: "add_header X-B 1;" }));
		await denied(internalHostTest.test(user(), "proxy_host", { id, advanced_config: "" }));

		await internalHostTest.test(user(), "proxy_host", { id, advanced_config: "add_header X-A 1;" });
		await internalHostTest.test(user(), "proxy_host", { id, forward_port: 81 });
		assert.equal(dryRuns.length, 2);
		assert.equal(dryRuns[1].host.advanced_config, "add_header X-A 1;");
	});

	it("keeps the saved location advanced config, matched by path, and refuses a changed one", async () => {
		const id = await insertProxyHost({
			locations: [location("/api", "proxy_set_header X-Api 1;"), location("~ ^/img", "expires 1d;")],
		});

		await internalHostTest.test(user(), "proxy_host", {
			id,
			locations: [location("~ ^/img", undefined, { enabled: false }), location(" /api ", undefined)],
		});
		assert.equal(dryRuns.length, 1);
		assert.deepEqual(
			dryRuns[0].host.locations.map((l) => [l.path, l.advanced_config]),
			[
				["~ ^/img", "expires 1d;"],
				["/api", "proxy_set_header X-Api 1;"],
			],
		);

		dryRuns.length = 0;
		await denied(
			internalHostTest.test(user(), "proxy_host", { id, locations: [location("/api", "return 200;")] }),
		);
		await denied(
			internalHostTest.test(user(), "proxy_host", { id, locations: [location("/new", "return 200;")] }),
		);
	});

	it("applies the rules of a save: a renamed location keeps its config, clearing is allowed, a copy is refused", async () => {
		const id = await insertProxyHost({
			locations: [location("/api", "proxy_set_header X-Api 1;"), location("/img", "expires 1d;")],
		});
		await internalHostTest.test(user(), "proxy_host", {
			id,
			locations: [location("/v2/api", "proxy_set_header X-Api 1;"), location("/img", "")],
		});
		assert.equal(dryRuns.length, 1);
		assert.deepEqual(
			dryRuns[0].host.locations.map((l) => [l.path, l.advanced_config]),
			[
				["/v2/api", "proxy_set_header X-Api 1;"],
				["/img", ""],
			],
		);

		dryRuns.length = 0;
		await denied(
			internalHostTest.test(user(), "proxy_host", {
				id,
				locations: [location("/api", "proxy_set_header X-Api 1;"), location("/img", "proxy_set_header X-Api 1;")],
			}),
		);
	});

	it("lets admins test any advanced config", async () => {
		const id = await insertProxyHost({ advanced_config: "add_header X-A 1;" });
		await internalHostTest.test(access, "proxy_host", {
			id,
			advanced_config: "add_header X-B 1;",
			locations: [location("/x", "expires 1d;")],
		});
		await internalHostTest.test(access, "dead_host", {
			domain_names: ["adv-dead-admin.example.com"],
			advanced_config: "return 200;",
		});
		assert.equal(dryRuns.length, 2);
	});
});

describe("config test: forbidden file directives are only checked after the permission checks", () => {
	const calls = { checks: 0 };
	let hostModule;
	before(async () => {
		hostModule = await load("internal/host.js");
		original.check = hostModule.assertNoForbiddenFileDirective;
		hostModule.assertNoForbiddenFileDirective = (data) => {
			calls.checks++;
			return original.check(data);
		};
	});
	after(() => {
		hostModule.assertNoForbiddenFileDirective = original.check;
	});
	beforeEach(() => {
		calls.checks = 0;
	});

	const anonymous = {
		can: async () => {
			throw new errs.PermissionError("Permission Denied");
		},
		hasRole: () => false,
		isAdmin: () => false,
		getPermissions: () => ({ visibility: "user", meta: null }),
		token: { getUserId: (fallback) => fallback, hasScope: () => false },
	};
	const slow = `include /data/nginx/${"*".repeat(5000)}z/*.conf;`;

	it("refuses an anonymous test without reading the advanced config", async () => {
		const id = await insertProxyHost();
		const start = performance.now();
		await denied(internalHostTest.test(anonymous, "proxy_host", proxyPayload({ advanced_config: slow })));
		await denied(internalHostTest.test(anonymous, "proxy_host", { id, advanced_config: slow }));
		await denied(
			internalHostTest.test(anonymous, "proxy_host", proxyPayload({ locations: [location("/a", slow)] })),
		);
		assert.ok(performance.now() - start < 200);
		assert.equal(calls.checks, 0);
	});

	it("gives a user who isn't an admin the advanced config rule, not the check", async () => {
		await denied(internalHostTest.test(user(), "proxy_host", proxyPayload({ advanced_config: slow })));
		assert.equal(calls.checks, 0);
	});

	it("still gives an admin the check's validation error, before the dry run", async () => {
		await assert.rejects(
			internalHostTest.test(
				access,
				"proxy_host",
				proxyPayload({ advanced_config: "include /data/nginx/proxy_host/1.conf;" }),
			),
			(err) => err instanceof errs.ValidationError && /^Advanced configuration: include of/.test(err.message),
		);
		assert.equal(calls.checks, 1);
		assert.equal(dryRuns.length, 0);
	});
});
