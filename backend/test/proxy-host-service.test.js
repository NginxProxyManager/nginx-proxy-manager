import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const testRoot = await mkdtemp(path.join(os.tmpdir(), "npm-proxy-host-test-"));
process.env.NPM_KEYS_FILE = path.join(testRoot, "keys.json");
process.env.DB_SQLITE_FILE = path.join(testRoot, "database.sqlite");

const [module, { default: proxyHostModel }, { default: upstreamModel }, { default: referenceModel }, { default: monitor }, { default: hostService }, { default: audit }, { default: deploymentModel }, { default: coordinator }] = await Promise.all([
	import("../internal/proxy-host.js"),
	import("../models/proxy_host.js"),
	import("../models/upstream.js"),
	import("../models/proxy_host_upstream.js"),
	import("../internal/proxy-host-monitor.js"),
	import("../internal/host.js"),
	import("../internal/audit-log.js"),
	import("../models/nginx_deployment.js"),
	import("../internal/nginx-deployment-coordinator.js"),
]);
const service = module.default;

const access = (visibility = "all") => ({
	can: async () => ({ permission_visibility: visibility }),
	token: { getUserId: () => 9 },
});

const directHost = {
	domain_names: ["example.test"],
	forward_scheme: "http",
	forward_host: "127.0.0.1",
	forward_port: 8080,
	nginx_config: { listener: { mode: "domain" }, options: {} },
	locations: [],
};

test("proxy target preparation normalizes direct and upstream references", () => {
	const direct = module.prepareProxyTargets(directHost);
	assert.equal(direct.data.default_target.type, "direct");
	assert.equal(direct.references.length, 0);

	const upstream = module.prepareProxyTargets({
		...directHost,
		forward_host: "upstream",
		default_target: { type: "upstream", scheme: "http", upstream_id: 17 },
		locations: [
			{ path: "/api/", match_type: "prefix", path_mode: "preserve_uri", forward_scheme: "https", forward_host: "upstream", forward_port: 443, target: { type: "upstream", scheme: "https", upstream_id: 18 } },
		],
	});
	assert.equal(upstream.references.length, 2);
	assert.deepEqual(upstream.references.map((item) => item.upstream_id), [17, 18]);
	assert.ok(upstream.data.locations[0].location_id);

	const inherited = module.prepareProxyTargets({ name: "changed" }, { ...directHost, locations: [{ path: "/old", forward_scheme: "http", forward_host: "old", forward_port: 80 }] });
	assert.equal(inherited.data.forward_host, "127.0.0.1");
	assert.equal(inherited.references.length, 0);
	assert.equal(module.getPortListenerPort({ nginx_config: { listener: { mode: "port", port: "8443" } } }), 8443);
	assert.equal(module.getPortListenerPort(directHost), null);
	assert.deepEqual(module.previewFields({ id: 1, host_id: 2, owner: {}, domain_names: ["x"] }), { domain_names: ["x"] });
});

test("proxy upstream dependency guards validate publication and synchronize references", async () => {
	const originals = { upstreamQuery: upstreamModel.query, referenceQuery: referenceModel.query };
	let upstreamRows = [{ id: 17, nginx_applied_enabled: 1, nginx_deployment_status: "online" }, { id: 18, nginx_applied_enabled: 1, nginx_deployment_status: "degraded" }];
	const calls = [];
	upstreamModel.query = () => {
		const chain = { whereIn: () => chain, where: () => chain, forUpdate: () => Promise.resolve(upstreamRows), then: (resolve, reject) => Promise.resolve(upstreamRows).then(resolve, reject) };
		return chain;
	};
	referenceModel.query = () => {
		const chain = { where: () => chain, delete: async () => calls.push("delete"), insert: async (rows) => calls.push(rows) };
		return chain;
	};
	try {
		const permissions = [];
		const guardedAccess = { can: async (_permission, id) => permissions.push(id) };
		const refs = [{ upstream_id: 18 }, { upstream_id: 17 }, { upstream_id: 17 }];
		const map = await module.assertReferencedUpstreamsAvailable(guardedAccess, refs, {});
		assert.deepEqual(permissions, [17, 18]);
		assert.equal(map.get(18).nginx_deployment_status, "degraded");
		assert.equal((await module.assertReferencedUpstreamsAvailable(guardedAccess, [], null)).size, 0);

		upstreamRows = [{ id: 17, nginx_applied_enabled: 0, nginx_deployment_status: "offline" }];
		await assert.rejects(() => module.assertReferencedUpstreamsAvailable(guardedAccess, [{ upstream_id: 17 }], null), /published and available/);
		upstreamRows = [];
		await assert.rejects(() => module.assertReferencedUpstreamsAvailable(guardedAccess, [{ upstream_id: 17 }], null), /do not exist/);

		await module.syncUpstreamReferences({}, 5, [{ upstream_id: 17, target_type: "default", location_id: "" }]);
		await module.syncUpstreamReferences({}, 5, []);
		assert.equal(calls.filter((item) => item === "delete").length, 2);
		assert.equal(calls[1][0].proxy_host_id, 5);
	} finally {
		upstreamModel.query = originals.upstreamQuery;
		referenceModel.query = originals.referenceQuery;
	}
});

test("proxy listener and dependency lookup detect collisions and stale upstreams", async () => {
	const originals = { hostQuery: proxyHostModel.query, upstreamQuery: upstreamModel.query };
	let hosts = [{ id: 2, nginx_config: { listener: { mode: "port", port: 8443 } } }];
	let upstreamRows = [{ id: 17, servers: [] }];
	proxyHostModel.query = () => {
		const chain = { where: () => chain, whereNot: () => chain, select: () => chain, then: (resolve, reject) => Promise.resolve(hosts).then(resolve, reject) };
		return chain;
	};
	upstreamModel.query = () => {
		const chain = { whereIn: () => chain, where: () => Promise.resolve(upstreamRows), then: (resolve, reject) => Promise.resolve(upstreamRows).then(resolve, reject) };
		return chain;
	};
	try {
		await assert.rejects(() => module.assertPortListenerAvailable({ nginx_config: { listener: { mode: "port", port: 8443 } } }), /already in use/);
		hosts = [];
		await module.assertPortListenerAvailable({ nginx_config: { listener: { mode: "port", port: 8443 } } }, 1);
		await module.assertPortListenerAvailable(directHost);

		const dependencies = await module.resolveUpstreamDependencies({ ...directHost, forward_host: "upstream", default_target: { type: "upstream", scheme: "http", upstream_id: 17 } });
		assert.equal(dependencies[17].id, 17);
		upstreamRows = [];
		await assert.rejects(() => module.resolveUpstreamDependencies({ ...directHost, forward_host: "upstream", default_target: { type: "upstream", scheme: "http", upstream_id: 17 } }), /no longer exists/);
		assert.deepEqual(await module.resolveUpstreamDependencies(directHost), {});
	} finally {
		proxyHostModel.query = originals.hostQuery;
		upstreamModel.query = originals.upstreamQuery;
	}
});

test("proxy host read, list and count flows enforce visibility, expansion and monitoring", async () => {
	const originals = { query: proxyHostModel.query, statuses: monitor.listStatuses };
	const operations = [];
	let result = { id: 5, owner_user_id: 9, domain_names: ["example.test"], certificate: { id: 2, meta: { certificate: "secret" } } };
	proxyHostModel.query = () => {
		const chain = {
			where: (...args) => { operations.push(["where", ...args]); return chain; },
			andWhere: (...args) => { operations.push(["andWhere", ...args]); return chain; },
			allowGraph: () => chain,
			withGraphFetched: (...args) => { operations.push(["expand", ...args]); return chain; },
			groupBy: () => chain,
			orderBy: () => { result = Array.isArray(result) ? result : [result]; return chain; },
			first: () => chain,
			count: () => { result = { count: "6" }; return chain; },
			then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
		};
		return chain;
	};
	monitor.listStatuses = async (rows) => new Map(rows.map((row) => [row.id, { status: "online" }]));
	try {
		const row = await service.get(access("user"), { id: 5, expand: ["certificate"] });
		assert.equal(row.id, 5);
		assert.ok(operations.some((item) => item[0] === "andWhere" && item[1] === "owner_user_id"));
		result = { id: 5, secret: "hidden" };
		assert.equal((await service.get(access(), { id: 5, omit: ["secret"] })).secret, undefined);

		result = [{ id: 5, domain_names: ["example.test"], certificate: { id: 2, meta: {} } }];
		const rows = await service.getAll(access("user"), ["certificate", "monitoring"], "example");
		assert.equal(rows[0].monitoring_status.status, "online");
		assert.ok(operations.some((item) => item[0] === "expand" && String(item[1]).includes("certificate")));
		result = { count: "6" };
		assert.equal(await service.getCount(9, "user"), 6);
	} finally {
		proxyHostModel.query = originals.query;
		monitor.listStatuses = originals.statuses;
	}
});

test("proxy host create persists desired state, references and audit data", async () => {
	const originals = {
		hostQuery: proxyHostModel.query,
		transaction: proxyHostModel.transaction,
		referenceQuery: referenceModel.query,
		taken: hostService.isHostnameTaken,
		get: service.get,
		audit: audit.add,
	};
	const operations = [];
	const saved = { id: 5, ...directHost, enabled: 0, nginx_config_revision: 1, meta: {} };
	proxyHostModel.transaction = async (callback) => callback({});
	proxyHostModel.query = () => {
		const chain = {
			where: () => chain,
			select: () => chain,
			insertAndFetch: async (data) => { operations.push(["insert", data]); return { id: 5, ...data, enabled: 0, nginx_config_revision: 1, meta: {} }; },
			then: (resolve, reject) => Promise.resolve([]).then(resolve, reject),
		};
		return chain;
	};
	referenceModel.query = () => {
		const chain = { where: () => chain, delete: async () => operations.push(["clear-references"]), insert: async (rows) => operations.push(["references", rows]) };
		return chain;
	};
	hostService.isHostnameTaken = async (hostname) => ({ hostname, is_taken: false });
	service.get = async () => ({ ...saved });
	audit.add = async (_access, data) => operations.push(["audit", data]);
	try {
		const result = await service.create(access(), { ...directHost, enabled: false });
		assert.equal(result.id, 5);
		assert.equal(operations.find((item) => item[0] === "insert")[1].owner_user_id, 9);
		assert.equal(operations.find((item) => item[0] === "insert")[1].advanced_config, "");
		assert.ok(operations.some((item) => item[0] === "clear-references"));
		assert.equal(operations.find((item) => item[0] === "audit")[1].action, "created");

		hostService.isHostnameTaken = async (hostname) => ({ hostname, is_taken: true });
		await assert.rejects(() => service.create(access(), { ...directHost }), /already in use/);
	} finally {
		proxyHostModel.query = originals.hostQuery;
		proxyHostModel.transaction = originals.transaction;
		referenceModel.query = originals.referenceQuery;
		hostService.isHostnameTaken = originals.taken;
		service.get = originals.get;
		audit.add = originals.audit;
	}
});

test("proxy host update enforces revisions and saves disabled hosts without deployment", async () => {
	const originals = {
		hostQuery: proxyHostModel.query,
		transaction: proxyHostModel.transaction,
		referenceQuery: referenceModel.query,
		taken: hostService.isHostnameTaken,
		get: service.get,
		audit: audit.add,
	};
	const operations = [];
	const existing = { id: 5, ...directHost, enabled: 0, nginx_config_revision: 3, meta: {} };
	proxyHostModel.transaction = async (callback) => callback({});
	proxyHostModel.query = () => {
		const chain = {
			where: (...args) => { operations.push(["where", ...args]); return chain; },
			whereNot: () => chain,
			select: () => chain,
			patch: async (data) => { operations.push(["patch", data]); return 1; },
			findById: async () => ({ ...existing, domain_names: ["updated.example"], nginx_config_revision: 4 }),
			then: (resolve, reject) => Promise.resolve([]).then(resolve, reject),
		};
		return chain;
	};
	referenceModel.query = () => {
		const chain = { where: () => chain, delete: async () => true, insert: async () => true };
		return chain;
	};
	hostService.isHostnameTaken = async (hostname) => ({ hostname, is_taken: false });
	service.get = async () => ({ ...existing });
	audit.add = async (_access, data) => operations.push(["audit", data]);
	try {
		const result = await service.update(access(), { id: 5, domain_names: ["updated.example"], base_revision: 3 });
		assert.equal(result.id, 5);
		const patch = operations.find((item) => item[0] === "patch")[1];
		assert.equal(patch.nginx_config_revision, 4);
		assert.equal(patch.nginx_deployment_status, "disabled");
		assert.equal(operations.find((item) => item[0] === "audit")[1].action, "updated");

		service.get = async () => ({ ...existing, nginx_config_revision: 4 });
		await assert.rejects(() => service.update(access(), { id: 5, domain_names: ["updated.example"], base_revision: 3 }), /Proxy Host has changed/);
		hostService.isHostnameTaken = async (hostname) => ({ hostname, is_taken: true });
		await assert.rejects(() => service.update(access(), { id: 5, domain_names: ["used.example"] }), /already in use/);
	} finally {
		proxyHostModel.query = originals.hostQuery;
		proxyHostModel.transaction = originals.transaction;
		referenceModel.query = originals.referenceQuery;
		hostService.isHostnameTaken = originals.taken;
		service.get = originals.get;
		audit.add = originals.audit;
	}
});

test("proxy deployment callbacks persist pending, applied and failed desired-state outcomes", async () => {
	const originals = { hostQuery: proxyHostModel.query, deploymentQuery: deploymentModel.query, deploy: coordinator.deploy, remove: coordinator.remove };
	const patches = [];
	let previous = { id: 5, meta: {}, nginx_applied_enabled: 1, nginx_applied_hash: "old" };
	proxyHostModel.query = () => {
		const chain = {
			where: () => chain,
			patch: async (data) => patches.push(data),
			findById: async () => previous,
		};
		return chain;
	};
	deploymentModel.query = () => ({ findOne: async () => ({ id: 88 }) });
	const host = { ...directHost, id: 5, owner_user_id: 9, enabled: 1, nginx_config_revision: 4, meta: {} };
	try {
		coordinator.deploy = async (options) => {
			await options.beforeCommit({ operationId: "deploy-ok" });
			await options.commitApplied({ operationId: "deploy-ok", rendered: { configHash: "hash", snapshot: { config: true } } });
			return { status: "online" };
		};
		assert.deepEqual(await module.deployProxyHost(host), { status: "online" });
		assert.equal(patches[0].nginx_deployment_status, "pending");
		assert.equal(patches[1].nginx_deployment_status, "online");
		assert.equal(patches[1].nginx_last_deployment_id, 88);

		coordinator.deploy = async (options) => {
			await options.commitFailure({ operationId: "deploy-fail", error: Object.assign(new Error("reload failed"), { code: "RELOAD", diagnostics: ["bad"] }), journal: { phase: "reload" } });
			return { status: "failed" };
		};
		await module.deployProxyHost(host);
		assert.equal(patches.at(-1).nginx_deployment_status, "degraded");
		assert.equal(patches.at(-1).nginx_last_error.code, "RELOAD");

		coordinator.remove = async (options) => {
			await options.beforeCommit({ operationId: "remove-ok" });
			await options.commitApplied({ operationId: "remove-ok" });
			return { status: "disabled" };
		};
		await module.removeProxyHostArtifact({ ...host, nginx_config_revision: 5 }, "deleted");
		assert.equal(patches.at(-1).nginx_deployment_status, "deleted");
		assert.equal(patches.at(-1).nginx_applied_enabled, 0);

		previous = { ...previous, nginx_applied_enabled: 0 };
		coordinator.remove = async (options) => {
			await options.commitFailure({ operationId: "remove-fail", error: new Error("remove failed"), journal: { phase: "swap" } });
			return { status: "failed" };
		};
		await module.removeProxyHostArtifact(host);
		assert.equal(patches.at(-1).nginx_deployment_status, "error");
		assert.equal(module.deploymentError("op", new Error("boom"), { phase: "test" }).code, "DEPLOYMENT_FAILED");
	} finally {
		proxyHostModel.query = originals.hostQuery;
		deploymentModel.query = originals.deploymentQuery;
		coordinator.deploy = originals.deploy;
		coordinator.remove = originals.remove;
	}
});

test("proxy preview renders partial candidates for pending certificate creation", async () => {
	const result = await service.previewNginxConfig(access(), {
		...directHost,
		certificate_id: "new",
		ssl_forced: true,
		http2_support: true,
		meta: {},
	});
	assert.equal(result.validation_scope, "partial");
	assert.equal(result.preview_token, null);
	assert.equal(result.unresolved_dependencies[0].code, "CERTIFICATE_PENDING_CREATE");
	assert.match(result.config, /example\.test/);
	assert.equal(typeof result.hash, "string");
});

test("proxy host enable, disable and delete lifecycle updates durable state and deployment", async () => {
	const originals = {
		hostQuery: proxyHostModel.query,
		transaction: proxyHostModel.transaction,
		referenceQuery: referenceModel.query,
		get: service.get,
		audit: audit.add,
		deploy: coordinator.deploy,
		remove: coordinator.remove,
	};
	const operations = [];
	let row = { id: 5, ...directHost, enabled: 0, nginx_config_revision: 2, owner_user_id: 9, meta: {} };
	proxyHostModel.transaction = async (callback) => callback({});
	proxyHostModel.query = () => {
		const chain = { where: () => chain, patch: async (data) => operations.push(["patch", data]) };
		return chain;
	};
	referenceModel.query = () => {
		const chain = { where: () => chain, delete: async () => operations.push(["delete-references"]) };
		return chain;
	};
	service.get = async () => ({ ...row });
	audit.add = async (_access, data) => operations.push(["audit", data.action]);
	coordinator.deploy = async () => operations.push(["deploy"]);
	coordinator.remove = async () => operations.push(["remove"]);
	try {
		assert.equal(await service.enable(access(), { id: 5 }), true);
		assert.equal(operations.find((item) => item[0] === "patch")[1].enabled, 1);
		assert.ok(operations.some((item) => item[0] === "deploy"));
		assert.ok(operations.some((item) => item[0] === "audit" && item[1] === "enabled"));
		row = { ...row, enabled: 1 };
		await assert.rejects(() => service.enable(access(), { id: 5 }), /already enabled/);

		assert.equal(await service.disable(access(), { id: 5 }), true);
		assert.ok(operations.some((item) => item[0] === "remove"));
		assert.ok(operations.some((item) => item[0] === "audit" && item[1] === "disabled"));
		row = { ...row, enabled: 0 };
		await assert.rejects(() => service.disable(access(), { id: 5 }), /already disabled/);

		assert.equal(await service.delete(access(), { id: 5 }), true);
		assert.ok(operations.some((item) => item[0] === "delete-references"));
		assert.ok(operations.some((item) => item[0] === "audit" && item[1] === "deleted"));
	} finally {
		proxyHostModel.query = originals.hostQuery;
		proxyHostModel.transaction = originals.transaction;
		referenceModel.query = originals.referenceQuery;
		service.get = originals.get;
		audit.add = originals.audit;
		coordinator.deploy = originals.deploy;
		coordinator.remove = originals.remove;
	}
});

test("proxy artifact status reports empty active and candidate files safely", async () => {
	const originalGet = service.get;
	service.get = async () => ({
		id: 5,
		enabled: 0,
		nginx_config_revision: 4,
		nginx_applied_revision: 3,
		nginx_config_migration_status: "migrated",
		nginx_config_migration_diagnostics: [],
		...directHost,
	});
	try {
		const result = await service.getNginxArtifacts(access(), 5, ["deployed", "candidate"]);
		assert.equal(result.host_id, 5);
		assert.equal(result.status, "disabled");
		assert.equal(result.deployed, null);
		assert.equal(result.candidate, null);
		assert.equal(result.desired_revision, 4);
	} finally {
		service.get = originalGet;
	}
});
