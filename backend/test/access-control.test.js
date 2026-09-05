import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const testRoot = await mkdtemp(path.join(os.tmpdir(), "npm-access-test-"));
process.env.NPM_KEYS_FILE = path.join(testRoot, "keys.json");
process.env.DB_SQLITE_FILE = path.join(testRoot, "database.sqlite");

const [
	{ default: Access },
	{ default: tokenFactory },
	{ default: userModel },
	{ default: proxyHostModel },
	{ default: upstreamModel },
] = await Promise.all([
	import("../lib/access.js"),
	import("../models/token.js"),
	import("../models/user.js"),
	import("../models/proxy_host.js"),
	import("../models/upstream.js"),
]);

const userQuery = (getUser) => {
	const chain = {
		where: () => chain,
		andWhere: () => chain,
		allowGraph: () => chain,
		withGraphFetched: () => chain,
		first: async () => getUser(),
	};
	return chain;
};

const rowsQuery = (rows, calls) => {
	const chain = {
		select: () => chain,
		andWhere: (...args) => {
			calls.push(args);
			return chain;
		},
		then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
	};
	return chain;
};

const permissions = (visibility = "user") => ({
	visibility,
	proxy_hosts: "manage",
	redirection_hosts: "manage",
	dead_hosts: "manage",
	streams: "manage",
	access_lists: "manage",
	certificates: "manage",
	upstreams: "manage",
});

test("internal access bypasses token checks while anonymous access is denied", async () => {
	const internal = new Access();
	assert.equal(await internal.load(true), true);
	assert.equal(await internal.can("settings:list"), true);

	const anonymous = new Access();
	assert.equal(await anonymous.load(false), null);
	await assert.rejects(() => anonymous.can("settings:list"), (error) => error.status === 403);
});

test("user tokens initialize once and validate role-based permissions", async () => {
	const originalQuery = userModel.query;
	let loads = 0;
	userModel.query = () => userQuery(() => {
		loads += 1;
		return { id: 7, roles: [], permissions: permissions("all") };
	});
	try {
		const signed = await tokenFactory().create({ attrs: { id: 7 }, scope: ["user"], expiresIn: "1h" });
		const access = new Access(signed.token);
		assert.ok(await access.load());
		const first = await access.can("reports:hosts", 1);
		const second = await access.can("reports:hosts", 2);
		assert.equal(first.data, 1);
		assert.equal(first.permission_visibility, "all");
		assert.equal(second.data, 2);
		assert.equal(loads, 1);
	} finally {
		userModel.query = originalQuery;
	}
});

test("object permissions load visible proxy hosts and upstreams once", async () => {
	const originalUserQuery = userModel.query;
	const originalProxyQuery = proxyHostModel.query;
	const originalUpstreamQuery = upstreamModel.query;
	const proxyCalls = [];
	const upstreamCalls = [];
	userModel.query = () => userQuery(() => ({ id: 7, roles: [], permissions: permissions("user") }));
	proxyHostModel.query = () => rowsQuery([{ id: 11 }, { id: 12 }], proxyCalls);
	upstreamModel.query = () => rowsQuery([{ id: 21 }], upstreamCalls);
	try {
		const signed = await tokenFactory().create({ attrs: { id: 7 }, scope: ["user"], expiresIn: "1h" });
		const access = new Access(signed.token);
		assert.equal((await access.can("proxy_hosts:get", 11)).data, 11);
		assert.deepEqual(await access.reloadObjects("proxy_hosts"), [11, 12]);
		assert.deepEqual(await access.reloadObjects("proxy_hosts"), [11, 12]);
		assert.equal((await access.can("upstreams:get", 21)).data, 21);
		assert.deepEqual(await access.reloadObjects("users"), [7]);
		assert.equal(proxyCalls.filter((args) => args[0] === "owner_user_id").length, 1);
		assert.equal(upstreamCalls.filter((args) => args[0] === "owner_user_id").length, 1);
	} finally {
		userModel.query = originalUserQuery;
		proxyHostModel.query = originalProxyQuery;
		upstreamModel.query = originalUpstreamQuery;
	}
});

test("empty object lists use the schema sentinel and reject inaccessible ids", async () => {
	const originalUserQuery = userModel.query;
	const originalProxyQuery = proxyHostModel.query;
	const originalUpstreamQuery = upstreamModel.query;
	userModel.query = () => userQuery(() => ({ id: 7, roles: [], permissions: permissions("all") }));
	proxyHostModel.query = () => rowsQuery([], []);
	upstreamModel.query = () => rowsQuery([], []);
	try {
		const signed = await tokenFactory().create({ attrs: { id: 7 }, scope: ["user"], expiresIn: "1h" });
		const access = new Access(signed.token);
		assert.equal((await access.can("proxy_hosts:get", 99)).data, 99);
		assert.deepEqual(await access.reloadObjects("proxy_hosts"), [0]);
		assert.deepEqual(await access.reloadObjects("upstreams"), [0]);
	} finally {
		userModel.query = originalUserQuery;
		proxyHostModel.query = originalProxyQuery;
		upstreamModel.query = originalUpstreamQuery;
	}
});

test("invalid token users, scopes, user ids and permission labels are denied", async () => {
	const originalQuery = userModel.query;
	try {
		const signed = await tokenFactory().create({ attrs: { id: 7 }, scope: ["user"], expiresIn: "1h" });
		userModel.query = () => userQuery(() => null);
		await assert.rejects(() => new Access(signed.token).can("reports:hosts", 1), (error) => error.status === 403);

		userModel.query = () => userQuery(() => ({ id: 7, roles: [], permissions: permissions() }));
		const adminToken = await tokenFactory().create({ attrs: { id: 7 }, scope: ["admin"], expiresIn: "1h" });
		await assert.rejects(() => new Access(adminToken.token).can("reports:hosts", 1), (error) => error.status === 403);

		const noIdToken = await tokenFactory().create({ attrs: {}, scope: ["user"], expiresIn: "1h" });
		await assert.rejects(() => new Access(noIdToken.token).can("users:get", 7), (error) => error.status === 403);
		await assert.rejects(() => new Access(signed.token).can("not:a-real-permission"), (error) => error.status === 403);
	} finally {
		userModel.query = originalQuery;
	}
});
