import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { access, db, load, ts, userAccess } from "./support/backend.js";

// The forbidden file directive check reads all of the advanced config. It must only run for callers who passed
// the permission checks (and, for non-admins, the advanced config rule): it used to run first, for anyone,
// including requests without a token.
const errs = await load("lib/error.js");
const internalHost = await load("internal/host.js");
const internalAuditLog = await load("internal/audit-log.js");

let checks = 0;
const original = {};

before(() => {
	original.check = internalHost.assertNoForbiddenFileDirective;
	original.audit = internalAuditLog.add;
	internalAuditLog.add = async () => {};
	internalHost.assertNoForbiddenFileDirective = (data) => {
		checks++;
		return original.check(data);
	};
});

after(async () => {
	internalHost.assertNoForbiddenFileDirective = original.check;
	internalAuditLog.add = original.audit;
	await db.destroy();
});

beforeEach(() => {
	checks = 0;
});

/** No token: Access.can() rejects, as for an anonymous request */
const anonymous = {
	can: async () => {
		throw new errs.PermissionError("Permission Denied");
	},
	hasRole: () => false,
	isAdmin: () => false,
	getPermissions: () => ({ visibility: "user", meta: null }),
	token: { getUserId: (fallback) => fallback, hasScope: () => false },
};

const forbidden = "include /data/nginx/proxy_host/1.conf;";
const slow = `include /data/nginx/${"*".repeat(5000)}z/*.conf;`;

const types = [
	{
		name: "proxy host",
		module: "internal/proxy-host.js",
		table: "proxy_host",
		row: {
			domain_names: JSON.stringify(["order-a.example.com"]),
			forward_scheme: "http",
			forward_host: "app",
			forward_port: 80,
			access_list_id: 0,
			advanced_config: "",
			locations: "[]",
		},
		create: (domain, extra) => ({
			domain_names: [domain],
			forward_scheme: "http",
			forward_host: "app",
			forward_port: 80,
			...extra,
		}),
	},
	{
		name: "redirection host",
		module: "internal/redirection-host.js",
		table: "redirection_host",
		row: {
			domain_names: JSON.stringify(["order-b.example.com"]),
			forward_scheme: "http",
			forward_domain_name: "target.example.com",
			forward_http_code: 301,
			advanced_config: "",
		},
		create: (domain, extra) => ({
			domain_names: [domain],
			forward_scheme: "http",
			forward_domain_name: "target.example.com",
			forward_http_code: 301,
			...extra,
		}),
	},
	{
		name: "dead host",
		module: "internal/dead-host.js",
		table: "dead_host",
		row: { domain_names: JSON.stringify(["order-c.example.com"]), advanced_config: "" },
		create: (domain, extra) => ({ domain_names: [domain], ...extra }),
	},
];

let nextId = 1;

for (const type of types) {
	describe(`${type.name}: forbidden file directive check after the permission checks`, () => {
		let internal;
		let id;
		before(async () => {
			internal = await load(type.module);
			id = nextId++;
			await db(type.table).insert({
				id,
				owner_user_id: 1,
				certificate_id: 0,
				enabled: 1,
				meta: "{}",
				...ts,
				...type.row,
			});
		});

		it("an anonymous create is refused without reading the advanced config", async () => {
			for (const advanced_config of [forbidden, slow]) {
				const start = performance.now();
				await assert.rejects(
					internal.create(anonymous, type.create(`new-${id}.example.com`, { advanced_config })),
					errs.PermissionError,
				);
				assert.ok(performance.now() - start < 50);
			}
			assert.equal(checks, 0);
		});

		it("an anonymous update is refused without reading the advanced config", async () => {
			for (const advanced_config of [forbidden, slow]) {
				await assert.rejects(internal.update(anonymous, { id, advanced_config }), errs.PermissionError);
			}
			assert.equal(checks, 0);
		});

		it("a user who isn't an admin gets the advanced config rule, not the check", async () => {
			const user = userAccess();
			await assert.rejects(
				internal.create(user, type.create(`user-${id}.example.com`, { advanced_config: slow })),
				errs.PermissionError,
			);
			await assert.rejects(internal.update(user, { id, advanced_config: forbidden }), errs.PermissionError);
			assert.equal(checks, 0);
		});

		it("an admin still gets the check's validation error", async () => {
			await assert.rejects(
				internal.create(access, type.create(`admin-${id}.example.com`, { advanced_config: forbidden })),
				(err) => err instanceof errs.ValidationError && /^Advanced configuration: include of/.test(err.message),
			);
			await assert.rejects(
				internal.update(access, { id, advanced_config: forbidden }),
				(err) => err instanceof errs.ValidationError && /^Advanced configuration: include of/.test(err.message),
			);
			assert.equal(checks, 2);
			const row = await db(type.table).where("id", id).first();
			assert.equal(row.advanced_config, "");
		});
	});
}
