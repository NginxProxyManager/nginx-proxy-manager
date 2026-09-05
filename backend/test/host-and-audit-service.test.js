import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const testRoot = await mkdtemp(path.join(os.tmpdir(), "npm-host-audit-test-"));
process.env.NPM_KEYS_FILE = path.join(testRoot, "keys.json");
process.env.DB_SQLITE_FILE = path.join(testRoot, "database.sqlite");

const [
	{ default: host },
	{ default: audit },
	{ default: proxyHostModel },
	{ default: redirectionHostModel },
	{ default: deadHostModel },
	{ default: auditModel },
] = await Promise.all([
	import("../internal/host.js"),
	import("../internal/audit-log.js"),
	import("../models/proxy_host.js"),
	import("../models/redirection_host.js"),
	import("../models/dead_host.js"),
	import("../models/audit-log.js"),
]);

test("host SSL cleanup and certificate redaction preserve safe public fields", () => {
	assert.deepEqual(host.cleanSslHstsData({ certificate_id: 0, ssl_forced: true, http2_support: true, hsts_enabled: true, hsts_subdomains: true }), {
		certificate_id: 0, ssl_forced: false, http2_support: false, hsts_enabled: false, hsts_subdomains: false,
	});
	assert.equal(host.cleanSslHstsData({ hsts_enabled: true }, { certificate_id: 2, ssl_forced: true }).hsts_enabled, true);
	const rows = [{ id: 1, certificate: { meta: { secret: true } } }, { id: 2 }, { id: 3, certificate: null }];
	assert.deepEqual(host.cleanAllRowsCertificateMeta(rows)[0].certificate.meta, {});
	assert.deepEqual(host.cleanRowCertificateMeta({ certificate: { meta: { secret: true } } }).certificate.meta, {});
});

test("host domain helpers match case-insensitively and honor ignored records", () => {
	const rows = [{ id: 1, domain_names: ["One.Example", "two.example"] }, { id: 2, domain_names: ["three.example"] }];
	assert.equal(host._checkHostnameRecordsTaken("one.example", rows, 0), true);
	assert.equal(host._checkHostnameRecordsTaken("one.example", rows, 1), false);
	assert.equal(host._checkHostnameRecordsTaken("missing.example", rows, 0), false);
	assert.equal(host._checkHostnameRecordsTaken("missing.example", [], 0), false);
	assert.deepEqual(host._getHostsWithDomains(rows, ["TWO.EXAMPLE"]), [rows[0]]);
	assert.deepEqual(host._getHostsWithDomains(null, ["two.example"]), []);
});

test("host lookup returns matching records across every host family", async () => {
	const originals = { proxy: proxyHostModel.query, redirection: redirectionHostModel.query, dead: deadHostModel.query };
	const rows = {
		proxy: [{ id: 1, domain_names: ["shared.example"] }],
		redirection: [{ id: 2, domain_names: ["other.example"] }],
		dead: [{ id: 3, domain_names: ["SHARED.EXAMPLE"] }],
	};
	const query = (family) => () => {
		const chain = {
			where: () => chain,
			andWhere: () => chain,
			then: (resolve, reject) => Promise.resolve(rows[family]).then(resolve, reject),
		};
		return chain;
	};
	proxyHostModel.query = query("proxy");
	redirectionHostModel.query = query("redirection");
	deadHostModel.query = query("dead");
	try {
		const found = await host.getHostsWithDomains(["shared.example"]);
		assert.equal(found.total_count, 2);
		assert.deepEqual(found.proxy_hosts.map((item) => item.id), [1]);
		assert.deepEqual(found.dead_hosts.map((item) => item.id), [3]);

		const taken = await host.isHostnameTaken("shared.example", "proxy", 1);
		assert.equal(taken.is_taken, true);
		rows.dead = [];
		assert.equal((await host.isHostnameTaken("shared.example", "proxy", 1)).is_taken, false);
		assert.equal((await host.isHostnameTaken("shared.example")).is_taken, true);
	} finally {
		proxyHostModel.query = originals.proxy;
		redirectionHostModel.query = originals.redirection;
		deadHostModel.query = originals.dead;
	}
});

test("audit service lists, retrieves and inserts validated entries", async () => {
	const originalQuery = auditModel.query;
	const operations = [];
	let result = [{ id: 2, action: "updated" }];
	let empty = false;
	auditModel.query = () => {
		const chain = {
			orderBy: () => chain,
			limit: () => chain,
			allowGraph: () => chain,
			where: (...args) => { operations.push(["where", ...args]); return chain; },
			andWhere: () => chain,
			withGraphFetched: (...args) => { operations.push(["expand", ...args]); return chain; },
			first: () => { if (!empty) result = { id: 2, action: "updated" }; return chain; },
			insert: async (data) => { operations.push(["insert", data]); return { id: 3, ...data }; },
			then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
		};
		return chain;
	};
	const access = { can: async () => true, token: { getUserId: () => 9 } };
	try {
		assert.equal((await audit.getAll(access, ["user"], "proxy")).length, 1);
		assert.ok(operations.some((item) => item[0] === "expand"));
		assert.equal((await audit.get(access, { id: 2, expand: ["user"] })).id, 2);
		const inserted = await audit.add(access, { action: "created", object_type: "proxy-host", object_id: 4 });
		assert.equal(inserted.user_id, 9);
		assert.deepEqual(inserted.meta, {});
		await assert.rejects(() => audit.add(access, { action: "" }), /must contain an Action/);
		empty = true;
		result = null;
		await assert.rejects(() => audit.get(access, { id: 99 }), /Not Found/);
	} finally {
		auditModel.query = originalQuery;
	}
});
