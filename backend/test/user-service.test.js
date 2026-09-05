import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const testRoot = await mkdtemp(path.join(os.tmpdir(), "npm-user-test-"));
process.env.NPM_KEYS_FILE = path.join(testRoot, "keys.json");
process.env.DB_SQLITE_FILE = path.join(testRoot, "database.sqlite");

const [
	{ default: service },
	{ default: userModel },
	{ default: authModel },
	{ default: permissionModel },
	{ default: audit },
	{ default: token },
] = await Promise.all([
	import("../internal/user.js"),
	import("../models/user.js"),
	import("../models/auth.js"),
	import("../models/user_permission.js"),
	import("../internal/audit-log.js"),
	import("../internal/token.js"),
]);

const access = (id = 1) => ({
	can: async () => true,
	token: { getUserId: () => id, hasScope: (scope) => scope === "admin" },
});

test("user create normalizes account data, auth and default permissions", async () => {
	const originals = { userQuery: userModel.query, authQuery: authModel.query, permissionQuery: permissionModel.query, get: service.get, audit: audit.add };
	const operations = [];
	userModel.query = () => ({ insertAndFetch: async (data) => ({ id: 7, ...data }) });
	authModel.query = () => ({ insert: async (data) => { operations.push(["auth", data]); return { id: 7, ...data }; } });
	permissionModel.query = () => ({ insert: async (data) => operations.push(["permissions", data]) });
	service.get = async () => ({ id: 7, name: "Alice", email: "alice@example.test", roles: ["admin"] });
	audit.add = async (_access, data) => operations.push(["audit", data]);
	try {
		const result = await service.create(access(), {
			name: "Alice", email: "alice@example.test", roles: ["admin"], is_disabled: false,
			auth: { type: "password", secret: "secret" },
		});
		assert.equal(result.id, 7);
		assert.equal(operations[0][1].user_id, 7);
		assert.equal(operations[1][1].visibility, "all");
		assert.equal(operations[2][1].action, "created");
	} finally {
		userModel.query = originals.userQuery;
		authModel.query = originals.authQuery;
		permissionModel.query = originals.permissionQuery;
		service.get = originals.get;
		audit.add = originals.audit;
	}
});

test("user read, availability, list, count and omission helpers cover access variants", async () => {
	const originalQuery = userModel.query;
	let mode = "row";
	userModel.query = () => {
		let result = { id: 7, name: "Alice", email: "alice@example.test", avatar: "", is_deleted: 0 };
		const chain = {
			where: () => chain,
			andWhere: () => chain,
			groupBy: () => chain,
			allowGraph: () => chain,
			withGraphFetched: () => chain,
			first: () => chain,
			count: () => { result = { count: "4" }; return chain; },
			orderBy: () => { result = [{ id: 7, name: "Alice", is_deleted: 0 }]; return chain; },
			then: (resolve, reject) => Promise.resolve(mode === "empty" ? null : result).then(resolve, reject),
		};
		return chain;
	};
	try {
		const row = await service.get(access(7), { id: 7, expand: ["permissions"] });
		assert.ok(row.avatar);
		const omitted = await service.get(access(7), { id: 7, omit: ["email"] });
		assert.equal(omitted.email, undefined);
		mode = "empty";
		assert.equal(await service.isEmailAvailable(" NEW@EXAMPLE.TEST ", 7), true);
		mode = "row";
		assert.equal(await service.isEmailAvailable("alice@example.test"), false);
		assert.equal(await service.getCount(access(), "alice"), 4);
		assert.deepEqual(await service.getAll(access(), ["permissions"], "alice"), [{ id: 7, name: "Alice" }]);
		assert.deepEqual(service.getUserOmisionsByAccess(access(), 99), []);
		const restricted = { token: { hasScope: () => false, getUserId: () => 1 } };
		assert.deepEqual(service.getUserOmisionsByAccess(restricted, 7), ["is_deleted"]);
	} finally {
		userModel.query = originalQuery;
	}
});

test("user update strips unauthorized roles, normalizes email and audits", async () => {
	const originals = { query: userModel.query, get: service.get, available: service.isEmailAvailable, audit: audit.add };
	let getCalls = 0;
	const calls = [];
	const limitedAccess = {
		can: async (permission) => { if (permission === "users:permissions") throw new Error("denied"); return true; },
		token: { getUserId: () => 1 },
	};
	service.get = async () => (++getCalls === 1 ? { id: 7, email: "old@example.test" } : { id: 7, name: "Alice", email: "new@example.test" });
	service.isEmailAvailable = async () => true;
	userModel.query = () => ({ patchAndFetchById: async (_id, data) => calls.push(["patch", data]) });
	audit.add = async (_access, data) => calls.push(["audit", data]);
	try {
		const data = { id: 7, email: " NEW@EXAMPLE.TEST ", name: "Alice", roles: ["admin"], is_disabled: true };
		const result = await service.update(limitedAccess, data);
		assert.equal(result.email, "new@example.test");
		assert.equal(data.roles, undefined);
		assert.equal(data.is_disabled, 1);
		assert.equal(calls[1][1].action, "updated");
	} finally {
		userModel.query = originals.query;
		service.get = originals.get;
		service.isEmailAvailable = originals.available;
		audit.add = originals.audit;
	}
});

test("user deletion protects self and soft-deletes other users", async () => {
	const originals = { query: userModel.query, get: service.get, audit: audit.add };
	const patches = [];
	service.get = async () => ({ id: 7, name: "Alice" });
	userModel.query = () => {
		const chain = { where: () => chain, patch: (data) => { patches.push(data); return Promise.resolve(1); } };
		return chain;
	};
	audit.add = async () => true;
	try {
		await assert.rejects(() => service.delete(access(7), { id: 7 }), /Permission Denied/);
		assert.equal(await service.delete(access(1), { id: 7 }), true);
		assert.deepEqual(patches[0], { is_deleted: 1 });
		await service.deleteAll();
		assert.deepEqual(patches[1], { is_deleted: 1 });
	} finally {
		userModel.query = originals.query;
		service.get = originals.get;
		audit.add = originals.audit;
	}
});

test("password, permissions and login-as flows update backing records", async () => {
	const originals = { authQuery: authModel.query, permissionQuery: permissionModel.query, get: service.get, audit: audit.add, emailToken: token.getTokenFromEmail, userToken: token.getTokenFromUser };
	const operations = [];
	service.get = async () => ({ id: 7, name: "Alice", email: "alice@example.test" });
	token.getTokenFromEmail = async (data) => operations.push(["verify", data]);
	token.getTokenFromUser = async (user) => ({ token: `token-${user.id}` });
	audit.add = async (_access, data) => operations.push(["audit", data]);
	authModel.query = () => {
		const chain = {
			where: () => chain,
			andWhere: () => chain,
			first: () => Promise.resolve({ id: 2 }),
			patch: async (data) => operations.push(["auth-patch", data]),
			insert: async (data) => operations.push(["auth-insert", data]),
		};
		return chain;
	};
	permissionModel.query = () => {
		const chain = {
			where: () => chain,
			first: () => Promise.resolve({ id: 3 }),
			patchAndFetchById: async (_id, data) => ({ ...data, id: 3 }),
			insertAndFetch: async (data) => ({ ...data, id: 3 }),
		};
		return chain;
	};
	try {
		assert.equal(await service.setPassword(access(7), { id: 7, type: "password", current: "old", secret: "new" }), true);
		assert.ok(operations.some(([kind]) => kind === "verify"));
		assert.ok(operations.some(([kind]) => kind === "auth-patch"));
		assert.equal(await service.setPermissions(access(), { id: 7, visibility: "all", proxy_hosts: "manage" }), true);
		assert.deepEqual(await service.loginAs(access(), { id: 7 }), { token: "token-7" });
	} finally {
		authModel.query = originals.authQuery;
		permissionModel.query = originals.permissionQuery;
		service.get = originals.get;
		audit.add = originals.audit;
		token.getTokenFromEmail = originals.emailToken;
		token.getTokenFromUser = originals.userToken;
	}
});
