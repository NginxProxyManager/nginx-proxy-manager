import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const testRoot = await mkdtemp(path.join(os.tmpdir(), "npm-host-test-"));
process.env.NPM_KEYS_FILE = path.join(testRoot, "keys.json");
process.env.DB_SQLITE_FILE = path.join(testRoot, "database.sqlite");

const [
	{ default: deadHost },
	{ default: redirectionHost },
	{ default: stream },
	{ default: deadHostModel },
	{ default: redirectionHostModel },
	{ default: streamModel },
	{ default: internalNginx },
	{ default: auditLog },
	{ default: internalHost },
] = await Promise.all([
	import("../internal/dead-host.js"),
	import("../internal/redirection-host.js"),
	import("../internal/stream.js"),
	import("../models/dead_host.js"),
	import("../models/redirection_host.js"),
	import("../models/stream.js"),
	import("../internal/nginx.js"),
	import("../internal/audit-log.js"),
	import("../internal/host.js"),
]);

const access = (visibility = "all") => ({
	can: async () => ({ permission_visibility: visibility }),
	token: { getUserId: () => 9 },
});

const queryFactory = ({ row, rows = [row], count = 2, patches = [] }) => () => {
	let result = row;
	const chain = {
		where: () => chain,
		andWhere: () => chain,
		groupBy: () => chain,
		allowGraph: () => chain,
		orderBy: () => { result = rows; return chain; },
		withGraphFetched: () => chain,
		count: () => { result = { count: String(count) }; return chain; },
		first: () => chain,
		patch: async (data) => { patches.push(data); return 1; },
		then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
	};
	return chain;
};

const families = [
	{ name: "dead host", service: deadHost, model: deadHostModel, type: "dead_host", domainBased: true },
	{ name: "redirection host", service: redirectionHost, model: redirectionHostModel, type: "redirection_host", domainBased: true },
	{ name: "stream", service: stream, model: streamModel, type: "stream", domainBased: false },
];

for (const family of families) {
	test(`${family.name} reads single/list/count data with visibility controls`, async () => {
		const originalQuery = family.model.query;
		const row = { id: 7, owner_user_id: 9, enabled: 1, meta: {}, domain_names: ["example.test"] };
		family.model.query = queryFactory({ row, rows: [row], count: 3 });
		try {
			assert.equal((await family.service.get(access("user"), { id: 7, expand: ["owner"], omit: ["owner_user_id"] })).id, 7);
			assert.equal((await family.service.getAll(access("user"), ["owner"], "example")).length, 1);
			assert.equal(await family.service.getCount(9, "user"), 3);
			assert.equal(await family.service.getCount(9, "all"), 3);
		} finally {
			family.model.query = originalQuery;
		}
	});

	test(`${family.name} enables, disables, deletes, audits, and updates Nginx`, async () => {
		const originalQuery = family.model.query;
		const originalGet = family.service.get;
		const originals = {
			configure: internalNginx.configure,
			deleteConfig: internalNginx.deleteConfig,
			reload: internalNginx.reload,
			audit: auditLog.add,
		};
		const patches = [];
		const nginxCalls = [];
		const audits = [];
		family.model.query = queryFactory({ row: {}, patches });
		internalNginx.configure = async (_model, type, row) => nginxCalls.push(["configure", type, row.id]);
		internalNginx.deleteConfig = async (type, row) => nginxCalls.push(["delete", type, row.id]);
		internalNginx.reload = async () => nginxCalls.push(["reload"]);
		auditLog.add = async (_access, data) => audits.push(data);
		try {
			family.service.get = async () => ({ id: 7, enabled: 0, meta: {}, domain_names: ["example.test"] });
			assert.equal(await family.service.enable(access(), { id: 7 }), true);
			family.service.get = async () => ({ id: 7, enabled: 1, meta: {}, domain_names: ["example.test"] });
			assert.equal(await family.service.disable(access(), { id: 7 }), true);
			assert.equal(await family.service.delete(access(), { id: 7 }), true);
			assert.ok(patches.some((patch) => patch.enabled === 1));
			assert.ok(patches.some((patch) => patch.enabled === 0));
			assert.ok(patches.some((patch) => patch.is_deleted === 1));
			assert.deepEqual(audits.map((entry) => entry.action), ["enabled", "disabled", "deleted"]);
			assert.ok(nginxCalls.some((call) => call[0] === "configure" && call[1] === family.type));
			assert.equal(nginxCalls.filter((call) => call[0] === "reload").length, 2);
		} finally {
			family.model.query = originalQuery;
			family.service.get = originalGet;
			internalNginx.configure = originals.configure;
			internalNginx.deleteConfig = originals.deleteConfig;
			internalNginx.reload = originals.reload;
			auditLog.add = originals.audit;
		}
	});

	test(`${family.name} rejects missing and already toggled records`, async () => {
		const originalGet = family.service.get;
		try {
			family.service.get = async () => ({ id: 7, enabled: 1 });
			await assert.rejects(() => family.service.enable(access(), { id: 7 }), /already enabled/);
			family.service.get = async () => ({ id: 7, enabled: 0 });
			await assert.rejects(() => family.service.disable(access(), { id: 7 }), /already disabled/);
			family.service.get = async () => null;
			await assert.rejects(() => family.service.delete(access(), { id: 7 }), /Not Found/);
		} finally {
			family.service.get = originalGet;
		}
	});

	test(`${family.name} creates and updates complete records`, async () => {
		const originals = {
			query: family.model.query,
			get: family.service.get,
			taken: internalHost.isHostnameTaken,
			configure: internalNginx.configure,
			audit: auditLog.add,
		};
		const operations = [];
		const base = family.domainBased
			? { domain_names: [`${family.type}.example`], certificate_id: 0, ssl_forced: false, meta: {} }
			: { incoming_port: 1234, forwarding_host: "127.0.0.1", forwarding_port: 4321, tcp_forwarding: true, udp_forwarding: false, meta: {}, domain_names: ["stream.example"] };
		let persisted = { id: 7, ...base, enabled: 1 };
		family.model.query = () => {
			const chain = {
				where: () => chain,
				insertAndFetch: async (data) => { operations.push(["insert", data]); persisted = { id: 7, ...data, enabled: 1 }; return persisted; },
				patch: async (data) => { operations.push(["patch", data]); persisted = { ...persisted, ...data }; return persisted; },
				patchAndFetchById: async (_id, data) => { operations.push(["patch", data]); persisted = { ...persisted, ...data }; return persisted; },
			};
			return chain;
		};
		family.service.get = async () => ({ ...persisted });
		internalHost.isHostnameTaken = async (hostname) => ({ hostname, is_taken: false });
		internalNginx.configure = async (_model, type) => { operations.push(["configure", type]); return { nginx_online: true }; };
		auditLog.add = async (_access, data) => operations.push(["audit", data.action]);
		try {
			const created = await family.service.create(access(), structuredClone(base));
			assert.equal(created.id, 7);
			assert.equal(operations.find((item) => item[0] === "insert")[1].owner_user_id, 9);
			assert.ok(operations.some((item) => item[0] === "audit" && item[1] === "created"));
			const update = family.domainBased ? { id: 7, domain_names: [`updated-${family.type}.example`] } : { id: 7, forwarding_port: 5555 };
			assert.equal((await family.service.update(access(), update)).id, 7);
			assert.ok(operations.some((item) => item[0] === "patch"));
			assert.ok(operations.some((item) => item[0] === "audit" && item[1] === "updated"));
			assert.ok(operations.filter((item) => item[0] === "configure").length >= 2);
			if (family.domainBased) {
				internalHost.isHostnameTaken = async (hostname) => ({ hostname, is_taken: true });
				await assert.rejects(() => family.service.create(access(), structuredClone(base)), /already in use/);
			}
		} finally {
			family.model.query = originals.query;
			family.service.get = originals.get;
			internalHost.isHostnameTaken = originals.taken;
			internalNginx.configure = originals.configure;
			auditLog.add = originals.audit;
		}
	});
}
