import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const testRoot = await mkdtemp(path.join(os.tmpdir(), "npm-upstream-test-"));
process.env.NPM_KEYS_FILE = path.join(testRoot, "keys.json");
process.env.DB_SQLITE_FILE = path.join(testRoot, "database.sqlite");

const [
	{ default: service, normalizeKey, normalizePayload, deployUpstream, removeUpstreamArtifact },
	{ default: upstreamModel },
	{ default: serverModel },
	{ default: audit },
	{ default: referenceModel },
	{ default: deploymentModel },
	{ default: coordinator },
] = await Promise.all([
	import("../internal/upstream.js"),
	import("../models/upstream.js"),
	import("../models/upstream_server.js"),
	import("../internal/audit-log.js"),
	import("../models/proxy_host_upstream.js"),
	import("../models/nginx_deployment.js"),
	import("../internal/nginx-deployment-coordinator.js"),
]);

const access = (visibility = "all") => ({
	can: async () => ({ permission_visibility: visibility }),
	token: { getUserId: () => 9 },
});

test("upstream payload normalization canonicalizes every supported server field", () => {
	assert.equal(normalizeKey(" API-Cluster "), "api-cluster");
	assert.deepEqual(
		normalizePayload({
			name: " API ",
			nginx_key: " API_Key ",
			load_balancing_method: "least_conn",
			zone_size: "128K",
			is_disabled: 1,
			servers: [{ host: "example.test", port: "8080", weight: "2", max_fails: 3, fail_timeout: "15s", max_conns: "40", backup: 1, down: 0 }],
		}, { creating: true }),
		{
			name: "API",
			nginx_key: "api_key",
			load_balancing_method: "least_conn",
			zone_size: "128k",
			is_disabled: true,
			servers: [{ host: "example.test", port: 8080, weight: 2, max_fails: 3, fail_timeout: "15s", max_conns: 40, backup: true, down: false, sort_order: 0 }],
		},
	);
	for (const payload of [
		{ nginx_key: "BAD KEY", servers: [{ host: "a", port: 80 }] },
		{ nginx_key: "valid", name: "", servers: [{ host: "a", port: 80 }] },
		{ nginx_key: "valid", load_balancing_method: "unknown", servers: [{ host: "a", port: 80 }] },
		{ nginx_key: "valid", zone_size: "zero", servers: [{ host: "a", port: 80 }] },
		{ nginx_key: "valid", servers: [] },
		{ nginx_key: "valid", servers: [{ host: "bad host", port: 80 }] },
		{ nginx_key: "valid", servers: [{ host: "a", port: 0 }] },
		{ nginx_key: "valid", servers: [{ host: "a", port: 80, weight: -1 }] },
		{ nginx_key: "valid", servers: [{ host: "a", port: 80, fail_timeout: "bad" }] },
		{ nginx_key: "valid", servers: [{ host: "a", port: 80, max_conns: 0 }] },
	]) assert.throws(() => normalizePayload(payload, { creating: true }), /invalid|required|between|duration|match|characters/);
});

test("upstream create stores normalized data and skips deployment when disabled", async () => {
	const originals = { transaction: upstreamModel.transaction, query: upstreamModel.query, serverQuery: serverModel.query, get: service.get, audit: audit.add };
	const inserted = [];
	upstreamModel.transaction = async (callback) => callback({ trx: true });
	upstreamModel.query = () => ({ insertAndFetch: async (value) => { inserted.push(["upstream", value]); return { id: 7, ...value }; } });
	serverModel.query = () => ({ insert: async (value) => inserted.push(["servers", value]) });
	service.get = async () => ({ id: 7, name: "API", is_disabled: true, owner_user_id: 9, servers: [{ host: "127.0.0.1", port: 8080 }] });
	audit.add = async (_access, data) => inserted.push(["audit", data]);
	try {
		const row = await service.create(access(), {
			name: " API ", nginx_key: "API", is_disabled: true,
			servers: [{ host: "127.0.0.1", port: 8080 }],
		});
		assert.equal(row.id, 7);
		assert.equal(inserted[0][1].nginx_key, "api");
		assert.equal(inserted[0][1].nginx_deployment_status, "disabled");
		assert.equal(inserted[1][1][0].upstream_id, 7);
		assert.equal(inserted[2][1].action, "created");
	} finally {
		upstreamModel.transaction = originals.transaction;
		upstreamModel.query = originals.query;
		serverModel.query = originals.serverQuery;
		service.get = originals.get;
		audit.add = originals.audit;
	}
});

test("upstream reads, lists and counts with visibility, expansion and search", async () => {
	const originalQuery = upstreamModel.query;
	const calls = [];
	upstreamModel.query = () => {
		let result = { id: 7, name: "API", is_deleted: 0, owner: { is_deleted: 0 } };
		const chain = {
			where: (...args) => { calls.push(["where", ...args]); return chain; },
			andWhere: (...args) => { calls.push(["andWhere", ...args]); return chain; },
			allowGraph: () => chain,
			first: () => chain,
			forUpdate: () => chain,
			withGraphFetched: (...args) => { calls.push(["expand", ...args]); return chain; },
			orderBy: () => { result = [{ id: 7, name: "API", is_deleted: 0 }]; return chain; },
			count: () => { result = { count: "3" }; return chain; },
			then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
		};
		return chain;
	};
	try {
		assert.equal((await service.get(access("user"), { id: 7, expand: ["servers"] })).id, 7);
		assert.deepEqual(await service.getAll(access("user"), ["owner"], "api"), [{ id: 7, name: "API" }]);
		assert.equal(await service.getCount(9, "user"), 3);
		assert.equal(await service.getCount(9, "all"), 3);
		assert.ok(calls.some(([kind]) => kind === "andWhere"));
		assert.ok(calls.some(([kind]) => kind === "expand"));
	} finally {
		upstreamModel.query = originalQuery;
	}
});

test("upstream preview renders a deterministic static candidate", async () => {
	const result = await service.previewNginxConfig(access(), {
		name: "API",
		nginx_key: "api_cluster",
		load_balancing_method: "round_robin",
		zone_size: "64k",
		servers: [{ host: "127.0.0.1", port: 8080 }],
	});
	assert.equal(result.valid, true);
	assert.match(result.config, /upstream api_cluster/);
	assert.equal(result.validation_scope, "static");
	assert.ok(result.diagnostics.some((entry) => entry.code === "NGINX_VALIDATION_ON_PUBLISH"));
});

test("upstream update replaces servers, disables publication and blocks immutable keys", async () => {
	const originals = {
		transaction: upstreamModel.transaction, query: upstreamModel.query, serverQuery: serverModel.query,
		referenceQuery: referenceModel.query, get: service.get, audit: audit.add, remove: coordinator.remove,
	};
	const operations = [];
	let current = { id: 7, owner_user_id: 9, nginx_key: "api", nginx_config_revision: 2, is_disabled: false };
	upstreamModel.transaction = async (callback) => callback({});
	upstreamModel.query = () => {
		const chain = {
			where: () => chain,
			forUpdate: () => chain,
			first: () => chain,
			patch: async (data) => { operations.push(["patch", data]); current = { ...current, ...data }; return 1; },
			findById: () => ({ withGraphFetched: async () => current }),
			then: (resolve, reject) => Promise.resolve(current).then(resolve, reject),
		};
		return chain;
	};
	serverModel.query = () => {
		const chain = { where: () => chain, delete: async () => operations.push(["delete-servers"]), insert: async (rows) => operations.push(["insert-servers", rows]) };
		return chain;
	};
	referenceModel.query = () => {
		const chain = { join: () => chain, where: () => chain, select: () => chain, forUpdate: async () => [] };
		return chain;
	};
	service.get = async () => ({ ...current, servers: [{ host: "127.0.0.1", port: 8081 }] });
	audit.add = async (_access, data) => operations.push(["audit", data]);
	coordinator.remove = async () => operations.push(["remove"]);
	try {
		const result = await service.update(access(), { id: 7, name: "New API", is_disabled: true, servers: [{ host: "127.0.0.1", port: 8081 }] });
		assert.equal(result.is_disabled, true);
		assert.equal(operations.find((item) => item[0] === "patch")[1].nginx_config_revision, 3);
		assert.ok(operations.some((item) => item[0] === "delete-servers"));
		assert.ok(operations.some((item) => item[0] === "remove"));
		assert.equal(operations.find((item) => item[0] === "audit")[1].action, "updated");
		current = { ...current, nginx_key: "api" };
		await assert.rejects(() => service.update(access(), { id: 7, nginx_key: "changed" }), /cannot be changed/);
	} finally {
		upstreamModel.transaction = originals.transaction;
		upstreamModel.query = originals.query;
		serverModel.query = originals.serverQuery;
		referenceModel.query = originals.referenceQuery;
		service.get = originals.get;
		audit.add = originals.audit;
		coordinator.remove = originals.remove;
	}
});

test("upstream references, publish, artifacts and delete expose safe lifecycle state", async () => {
	const originals = { query: upstreamModel.query, transaction: upstreamModel.transaction, referenceQuery: referenceModel.query, get: service.get, audit: audit.add, deploy: coordinator.deploy, remove: coordinator.remove };
	const operations = [];
	const row = { id: 7, owner_user_id: 9, nginx_key: "api", nginx_config_revision: 2, nginx_deployment_status: "online", is_disabled: false, servers: [] };
	upstreamModel.query = () => {
		const chain = {
			where: () => chain, allowGraph: () => chain, first: () => chain, forUpdate: () => chain, withGraphFetched: () => chain,
			patch: async (data) => operations.push(["patch", data]),
			then: (resolve, reject) => Promise.resolve(row).then(resolve, reject),
		};
		return chain;
	};
	upstreamModel.transaction = async (callback) => callback({});
	referenceModel.query = () => {
		const chain = {
			alias: () => chain, join: () => chain, where: () => chain,
			select: () => chain, forUpdate: () => chain,
			then: (resolve, reject) => Promise.resolve([]).then(resolve, reject),
		};
		return chain;
	};
	service.get = async () => row;
	audit.add = async (_access, data) => operations.push(["audit", data]);
	coordinator.deploy = async () => operations.push(["deploy"]);
	coordinator.remove = async () => operations.push(["remove"]);
	try {
		assert.deepEqual(await service.getReferences(access(), 7), { upstream_id: 7, references: [] });
		assert.equal((await service.publish(access(), 7)).id, 7);
		assert.ok(operations.some((item) => item[0] === "deploy"));
		const artifacts = await service.getNginxArtifacts(access(), 7, ["deployed"]);
		assert.equal(artifacts.deployed, null);
		assert.equal(artifacts.candidate, null);
		assert.equal(await service.delete(access(), { id: 7 }), true);
		assert.ok(operations.some((item) => item[0] === "remove"));
		assert.equal(operations.find((item) => item[0] === "patch")[1].nginx_deployment_status, "deleted");
	} finally {
		upstreamModel.query = originals.query;
		upstreamModel.transaction = originals.transaction;
		referenceModel.query = originals.referenceQuery;
		service.get = originals.get;
		audit.add = originals.audit;
		coordinator.deploy = originals.deploy;
		coordinator.remove = originals.remove;
	}
});

test("upstream deployment callbacks persist successful and failed deployment states", async () => {
	const originals = { query: upstreamModel.query, deploymentQuery: deploymentModel.query, deploy: coordinator.deploy, remove: coordinator.remove };
	const patches = [];
	let previous = { id: 7, nginx_applied_enabled: 1, nginx_applied_hash: "old", is_disabled: false };
	upstreamModel.query = () => {
		const chain = { where: () => chain, patch: async (data) => patches.push(data), findById: async () => previous };
		return chain;
	};
	deploymentModel.query = () => ({ findOne: async () => ({ id: 90 }) });
	const row = { id: 7, owner_user_id: 9, nginx_config_revision: 3, servers: [] };
	try {
		coordinator.deploy = async (options) => {
			await options.beforeCommit({ operationId: "ok" });
			await options.commitApplied({ operationId: "ok", rendered: { configHash: "hash", snapshot: {} } });
		};
		await deployUpstream(row);
		assert.equal(patches.at(-1).nginx_deployment_status, "online");
		coordinator.deploy = async (options) => options.commitFailure({ operationId: "bad", error: new Error("reload"), journal: { phase: "reload" } });
		await deployUpstream(row);
		assert.equal(patches.at(-1).nginx_deployment_status, "online");

		coordinator.remove = async (options) => { await options.beforeCommit({ operationId: "remove" }); await options.commitApplied({ operationId: "remove" }); };
		await removeUpstreamArtifact(row);
		assert.equal(patches.at(-1).nginx_deployment_status, "disabled");
		previous = { ...previous, nginx_applied_enabled: 0 };
		coordinator.remove = async (options) => options.commitFailure({ operationId: "remove-bad", error: new Error("remove"), journal: { phase: "swap" } });
		await removeUpstreamArtifact(row);
		assert.equal(patches.at(-1).nginx_deployment_status, "error");
	} finally {
		upstreamModel.query = originals.query;
		deploymentModel.query = originals.deploymentQuery;
		coordinator.deploy = originals.deploy;
		coordinator.remove = originals.remove;
	}
});
