import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const testRoot = await mkdtemp(path.join(os.tmpdir(), "npm-access-list-test-"));
process.env.NPM_KEYS_FILE = path.join(testRoot, "keys.json");
process.env.DB_SQLITE_FILE = path.join(testRoot, "database.sqlite");

const [
	{ default: service },
	{ default: listModel },
	{ default: authModel },
	{ default: clientModel },
	{ default: proxyHostModel },
	{ default: nginx },
	{ default: audit },
	{ default: utils },
] = await Promise.all([
	import("../internal/access-list.js"),
	import("../models/access_list.js"),
	import("../models/access_list_auth.js"),
	import("../models/access_list_client.js"),
	import("../models/proxy_host.js"),
	import("../internal/nginx.js"),
	import("../internal/audit-log.js"),
	import("../lib/utils.js"),
]);

const access = {
	can: async () => ({ permission_visibility: "all" }),
	token: { getUserId: () => 9 },
};

const originals = {
	listQuery: listModel.query,
	authQuery: authModel.query,
	clientQuery: clientModel.query,
	proxyQuery: proxyHostModel.query,
	get: service.get,
	build: service.build,
	bulk: nginx.bulkGenerateConfigs,
	reload: nginx.reload,
	audit: audit.add,
};

const restore = () => {
	listModel.query = originals.listQuery;
	authModel.query = originals.authQuery;
	clientModel.query = originals.clientQuery;
	proxyHostModel.query = originals.proxyQuery;
	service.get = originals.get;
	service.build = originals.build;
	nginx.bulkGenerateConfigs = originals.bulk;
	nginx.reload = originals.reload;
	audit.add = originals.audit;
};

test.afterEach(restore);

test("access list create persists members, builds credentials and regenerates attached hosts", async () => {
	const inserted = [];
	const nginxCalls = [];
	const audits = [];
	listModel.query = () => ({
		insertAndFetch: async (value) => ({ id: 7, ...value, meta: {} }),
	});
	authModel.query = () => ({ insert: async (value) => inserted.push(["auth", value]) });
	clientModel.query = () => ({ insert: async (value) => inserted.push(["client", value]) });
	service.get = async () => ({
		id: 7,
		name: "Office",
		meta: { generated: true },
		items: [{ username: "alice", password: "secret" }],
		clients: [{ address: "10.0.0.0/8", directive: "allow" }],
		proxy_host_count: "1",
		proxy_hosts: [{ id: 3 }],
	});
	service.build = async (row) => inserted.push(["build", row.id]);
	nginx.bulkGenerateConfigs = async (...args) => nginxCalls.push(args);
	audit.add = async (_access, data) => audits.push(data);

	const result = await service.create(access, {
		name: "Office",
		satisfy_any: true,
		pass_auth: false,
		items: [{ username: "alice", password: "secret" }],
		clients: [{ address: "10.0.0.0/8", directive: "allow" }],
	});

	assert.equal(result.id, 7);
	assert.equal(result.items[0].password, "");
	assert.equal(result.items[0].hint, "s*****");
	assert.equal(inserted.filter(([kind]) => kind === "auth").length, 1);
	assert.equal(inserted.filter(([kind]) => kind === "client").length, 1);
	assert.deepEqual(nginxCalls[0], ["proxy_host", [{ id: 3 }]]);
	assert.equal(audits[0].action, "created");
});

test("access list update replaces credentials and clients, then rebuilds and reloads", async () => {
	const operations = [];
	const deletionChain = () => {
		const chain = {
			where: (...args) => { operations.push(["where", ...args]); return chain; },
			andWhere: (...args) => { operations.push(["andWhere", ...args]); return chain; },
			then: (resolve, reject) => Promise.resolve(1).then(resolve, reject),
		};
		return chain;
	};
	listModel.query = () => ({ where: () => ({ patch: async (value) => operations.push(["patch", value]) }) });
	authModel.query = () => ({
		insert: async (value) => operations.push(["auth-insert", value]),
		delete: deletionChain,
	});
	clientModel.query = () => ({
		insert: async (value) => operations.push(["client-insert", value]),
		delete: deletionChain,
	});
	service.get = async () => ({ id: 7, name: "Office", meta: {}, items: [], clients: [], proxy_host_count: "0", proxy_hosts: [] });
	service.build = async () => operations.push(["build"]);
	nginx.reload = async () => operations.push(["reload"]);
	audit.add = async (_access, data) => operations.push(["audit", data.action]);

	const result = await service.update(access, {
		id: 7,
		name: "New office",
		satisfy_any: false,
		pass_auth: true,
		items: [
			{ username: "keep", password: "" },
			{ username: "new", password: "secret" },
		],
		clients: [{ address: "192.168.1.0/24", directive: "allow" }, { address: "" }],
	});

	assert.equal(result.id, 7);
	assert.ok(operations.some(([kind]) => kind === "patch"));
	assert.ok(operations.some(([kind]) => kind === "andWhere"));
	assert.ok(operations.some(([kind]) => kind === "auth-insert"));
	assert.equal(operations.filter(([kind]) => kind === "client-insert").length, 1);
	assert.ok(operations.some(([kind]) => kind === "reload"));
});

test("access list delete detaches hosts, removes config dependencies and audits", async () => {
	const patches = [];
	const nginxCalls = [];
	service.get = async () => ({
		id: 7,
		name: "Office",
		items: [{ username: "alice", password: "secret" }],
		clients: [],
		proxy_hosts: [{ id: 3, access_list_id: 7 }],
	});
	listModel.query = () => ({ where: () => ({ patch: async (value) => patches.push(["list", value]) }) });
	proxyHostModel.query = () => {
		const chain = { where: () => chain, patch: async (value) => patches.push(["host", value]) };
		return chain;
	};
	nginx.bulkGenerateConfigs = async (...args) => nginxCalls.push(args);
	nginx.reload = async () => nginxCalls.push(["reload"]);
	audit.add = async (_access, data) => patches.push(["audit", data]);

	assert.equal(await service.delete(access, { id: 7 }), true);
	assert.deepEqual(patches[0], ["list", { is_deleted: 1 }]);
	assert.deepEqual(patches[1], ["host", { access_list_id: 0 }]);
	assert.equal(nginxCalls[0][1][0].access_list_id, 0);
	assert.equal(patches.at(-1)[1].action, "deleted");
});

test("access list helpers mask passwords and build stable file names", () => {
	const list = service.maskItems({ id: 42, items: [{ password: "secret" }, { password: "" }, {}] });
	assert.deepEqual(list.items.map((item) => item.hint), ["s*****", "*********", "*********"]);
	assert.ok(list.items.every((item) => item.password === ""));
	assert.equal(service.getFilename(list), "/data/access/42");
});

test("access list get, list and count apply visibility, expansion and password masking", async () => {
	const calls = [];
	let mode = "row";
	listModel.query = () => {
		let result = { id: 7, name: "Office", is_deleted: 0, items: [{ username: "alice", password: "secret" }] };
		const chain = {
			select: () => chain,
			leftJoin: (_table, callback) => { callback.call({ on: () => ({ andOn: () => true }) }); return chain; },
			where: (...args) => { calls.push(["where", ...args]); return chain; },
			andWhere: (...args) => { calls.push(["andWhere", ...args]); return chain; },
			groupBy: () => chain,
			allowGraph: () => chain,
			first: () => chain,
			orderBy: () => { result = [{ id: 7, name: "Office", is_deleted: 0, items: [{ password: "secret" }] }]; return chain; },
			withGraphFetched: (...args) => { calls.push(["expand", ...args]); return chain; },
			count: () => { result = { count: "4" }; return chain; },
			then: (resolve, reject) => Promise.resolve(mode === "missing" ? null : result).then(resolve, reject),
		};
		return chain;
	};
	const restricted = { can: async () => ({ permission_visibility: "user" }), token: { getUserId: () => 9 } };
	try {
		const row = await service.get(restricted, { id: 7, expand: ["items"], omit: ["name"] });
		assert.equal(row.name, undefined);
		assert.equal(row.items[0].password, "");
		assert.ok(calls.some((item) => item[0] === "andWhere" && item[1] === "access_list.owner_user_id"));
		const rows = await service.getAll(restricted, ["items"], "office");
		assert.equal(rows[0].items[0].password, "");
		assert.equal(await service.getCount(9, "user"), 4);
		mode = "missing";
		await assert.rejects(() => service.get(access, { id: 99 }), /Not Found/);
	} finally {
		listModel.query = originals.listQuery;
	}
});

test("access list builder hashes credentials and writes the htpasswd file", async () => {
	const originalFs = { unlink: fs.unlinkSync, write: fs.writeFileSync, append: fs.appendFileSync };
	const originalExecFile = utils.execFile;
	const writes = [];
	fs.unlinkSync = () => { throw new Error("missing"); };
	fs.writeFileSync = (...args) => writes.push(["write", ...args]);
	fs.appendFileSync = (...args) => writes.push(["append", ...args]);
	utils.execFile = async (command, args) => {
		assert.equal(command, "openssl");
		assert.deepEqual(args, ["passwd", "-apr1", "secret"]);
		return "$apr1$hash";
	};
	try {
		await service.build({ id: 7, name: "Office", items: [{ username: "alice", password: "secret" }] });
		assert.equal(writes[0][0], "write");
		assert.match(writes[1][2], /alice:\$apr1\$hash/);
		await service.build({ id: 8, name: "Empty", items: [] });
	} finally {
		fs.unlinkSync = originalFs.unlink;
		fs.writeFileSync = originalFs.write;
		fs.appendFileSync = originalFs.append;
		utils.execFile = originalExecFile;
	}
});
