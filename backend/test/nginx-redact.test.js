// redactConfigError: a "global" nginx error names the host that broke nginx. Users only see the details of
// a host they can see: their own, or a proxy host shared with them in permissions.meta.proxy_host_ids.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { access, db, load, ts, userAccess } from "./support/backend.js";

const errs = await load("lib/error.js");
const internalNginx = await load("internal/nginx.js");

const OTHER_USER = 2;
const ME = 3;

const globalError = (hostType, hostId) =>
	new errs.NginxConfigError('unknown directive "bogus"', {
		kind: "nginx_config",
		scope: "global",
		host_type: hostType,
		host_id: hostId,
		file: `/data/nginx/${hostType}/${hostId}.conf`,
		line: 3,
		nginx_output: "nginx: [emerg] unknown directive",
	});

const isRedacted = (err) => err.details.host_id === null && err.details.nginx_output === null;

before(async () => {
	for (const id of [OTHER_USER, ME]) {
		await db("user").insert({
			id,
			name: `User ${id}`,
			nickname: `u${id}`,
			email: `u${id}@example.com`,
			avatar: "",
			roles: "[]",
			...ts,
		});
	}
	const proxy = { forward_scheme: "http", forward_host: "app", forward_port: 80, is_deleted: 0, meta: "{}", ...ts };
	await db("proxy_host").insert([
		{ id: 1, owner_user_id: OTHER_USER, domain_names: '["other.example.com"]', ...proxy },
		{ id: 2, owner_user_id: OTHER_USER, domain_names: '["shared.example.com"]', ...proxy },
		{ id: 3, owner_user_id: ME, domain_names: '["mine.example.com"]', ...proxy },
		{ id: 4, owner_user_id: OTHER_USER, domain_names: '["deleted.example.com"]', ...proxy, is_deleted: 1 },
	]);
	await db("redirection_host").insert({
		id: 2,
		owner_user_id: OTHER_USER,
		domain_names: '["redirect.example.com"]',
		forward_scheme: "http",
		forward_domain_name: "target.example.com",
		forward_http_code: 301,
		meta: "{}",
		...ts,
	});
});

after(async () => {
	await db.destroy();
});

describe("redactConfigError", () => {
	const user = userAccess({ userId: ME, visibility: "user", meta: { proxy_host_ids: [2, 4] } });

	it("shows the details to a user who can see all hosts", async () => {
		assert.ok(!isRedacted(await internalNginx.redactConfigError(access, globalError("proxy_host", 1))));
	});

	it("shows the details of the user's own host", async () => {
		assert.ok(!isRedacted(await internalNginx.redactConfigError(user, globalError("proxy_host", 3))));
	});

	it("shows the details of a proxy host shared with the user", async () => {
		const err = await internalNginx.redactConfigError(user, globalError("proxy_host", 2));
		assert.ok(!isRedacted(err));
		assert.equal(err.details.host_id, 2);
	});

	it("redacts another user's host that isn't shared", async () => {
		const err = await internalNginx.redactConfigError(user, globalError("proxy_host", 1));
		assert.ok(isRedacted(err));
		assert.match(err.message, /another host/);
	});

	it("redacts a shared proxy host that was deleted", async () => {
		assert.ok(isRedacted(await internalNginx.redactConfigError(user, globalError("proxy_host", 4))));
	});

	it("only shares proxy hosts: the same id of another host type stays redacted", async () => {
		assert.ok(isRedacted(await internalNginx.redactConfigError(user, globalError("redirection_host", 2))));
	});
});
