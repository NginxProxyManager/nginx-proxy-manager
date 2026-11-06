import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { access, db, load, ts, userAccess } from "./support/backend.js";

const errs = await load("lib/error.js");
const internalNginx = await load("internal/nginx.js");
const internalCertificate = await load("internal/certificate.js");
const internalAuditLog = await load("internal/audit-log.js");

const original = {};
let issued = [];
let deleted = [];
let dryRuns = 0;
let configures = 0;
// Certificate ids nginx rejects: an update that is only rejected once the new certificate is in it
let rejectCertificates = new Set();
// Runs once a certificate is issued, eg. to let another host take it up meanwhile
let afterIssue = null;

const isBad = (host) =>
	host.advanced_config === "bogus_directive on;" || host.forwarding_host === "bad" || host.forward_host === "bad";

before(() => {
	original.configure = internalNginx.configure;
	original.createQuickCertificate = internalCertificate.createQuickCertificate;
	original.delete = internalCertificate.delete;
	original.audit = internalAuditLog.add;
	internalAuditLog.add = async () => {};
	internalNginx.configure = async (_model, _hostType, host, opts = {}) => {
		configures++;
		if (opts.dryRun) {
			dryRuns++;
		}
		if (isBad(host) || rejectCertificates.has(host.certificate_id)) {
			throw new errs.NginxConfigError('unknown directive "bogus_directive"', {
				kind: "nginx_config",
				scope: "host",
			});
		}
		return { nginx_online: true };
	};
	internalCertificate.createQuickCertificate = async (_access, data) => {
		const [id] = await db("certificate").insert({
			owner_user_id: 1,
			provider: "letsencrypt",
			nice_name: "test",
			domain_names: JSON.stringify(data.domain_names || []),
			meta: "{}",
			expires_on: "2027-01-01 00:00:00",
			...ts,
		});
		issued.push(id);
		if (afterIssue) {
			await afterIssue(id);
		}
		return { id };
	};
	internalCertificate.delete = async (_access, data) => {
		deleted.push(data.id);
		await db("certificate").where("id", data.id).update({ is_deleted: 1 });
		return true;
	};
});

after(async () => {
	Object.assign(internalNginx, { configure: original.configure });
	Object.assign(internalCertificate, {
		createQuickCertificate: original.createQuickCertificate,
		delete: original.delete,
	});
	internalAuditLog.add = original.audit;
	await db.destroy();
});

const types = [
	{
		name: "proxy host",
		module: "internal/proxy-host.js",
		table: "proxy_host",
		bad: { advanced_config: "bogus_directive on;" },
		skipsDisabled: true,
		row: {
			domain_names: JSON.stringify(["a.example.com"]),
			forward_scheme: "http",
			forward_host: "app",
			forward_port: 80,
			access_list_id: 0,
			advanced_config: "",
			locations: "[]",
		},
		create: (domain) => ({
			domain_names: [domain],
			forward_scheme: "http",
			forward_host: "app",
			forward_port: 80,
		}),
	},
	{
		name: "redirection host",
		module: "internal/redirection-host.js",
		table: "redirection_host",
		bad: { advanced_config: "bogus_directive on;" },
		skipsDisabled: false,
		row: {
			domain_names: JSON.stringify(["b.example.com"]),
			forward_scheme: "http",
			forward_domain_name: "target.example.com",
			forward_http_code: 301,
			advanced_config: "",
		},
		create: (domain) => ({
			domain_names: [domain],
			forward_scheme: "http",
			forward_domain_name: "target.example.com",
			forward_http_code: 301,
		}),
	},
	{
		name: "dead host",
		module: "internal/dead-host.js",
		table: "dead_host",
		bad: { advanced_config: "bogus_directive on;" },
		skipsDisabled: true,
		row: { domain_names: JSON.stringify(["c.example.com"]), advanced_config: "" },
		create: (domain) => ({ domain_names: [domain] }),
	},
	{
		name: "stream",
		module: "internal/stream.js",
		table: "stream",
		bad: { forwarding_host: "bad" },
		skipsDisabled: false,
		row: { incoming_port: 9000, forwarding_host: "app", forwarding_port: 80, tcp_forwarding: 1, udp_forwarding: 0 },
		create: (domain) => ({
			domain_names: [domain],
			incoming_port: 9100,
			forwarding_host: "app",
			forwarding_port: 80,
			tcp_forwarding: true,
			udp_forwarding: false,
		}),
	},
];

let nextId = 1;
const liveCertificates = async () => (await db("certificate").where("is_deleted", 0)).map((c) => c.id);

for (const type of types) {
	describe(`${type.name} update with a new certificate`, () => {
		let internal;
		const insertHost = async (enabled = 1) => {
			const id = nextId++;
			await db(type.table).insert({
				id,
				owner_user_id: 1,
				certificate_id: 0,
				enabled,
				meta: "{}",
				...ts,
				...type.row,
			});
			return id;
		};
		const host = async (id) => db(type.table).where("id", id).first();

		before(async () => {
			internal = await load(type.module);
		});
		beforeEach(() => {
			issued = [];
			deleted = [];
			dryRuns = 0;
			configures = 0;
			rejectCertificates = new Set();
			afterIssue = null;
		});
		afterEach(async () => {
			await db("certificate").update({ is_deleted: 1 });
		});

		it("does not request a certificate when nginx rejects the rest of the update", async () => {
			const id = await insertHost();
			await assert.rejects(
				internal.update(access, { id, certificate_id: "new", ...type.bad }),
				errs.NginxConfigError,
			);
			assert.deepEqual(issued, []);
			assert.equal(dryRuns, 1);
			const row = await host(id);
			assert.equal(row.certificate_id, 0);
			assert.equal(row.advanced_config ?? "", type.row.advanced_config ?? "");
		});

		it("removes the new certificate when nginx only rejects the update with it", async () => {
			const id = await insertHost();
			// the next certificate is the one this update requests
			const next = ((await db("certificate").max("id as id").first()).id || 0) + 1;
			rejectCertificates.add(next);

			await assert.rejects(internal.update(access, { id, certificate_id: "new" }), errs.NginxConfigError);
			assert.deepEqual(issued, [next]);
			assert.deepEqual(deleted, [next]);
			assert.equal((await host(id)).certificate_id, 0);
			assert.deepEqual(await liveCertificates(), []);
		});

		it("replaces a broken certificate: the check runs without the certificate being replaced", async () => {
			const [old] = await db("certificate").insert({
				owner_user_id: 1,
				provider: "letsencrypt",
				nice_name: "old",
				domain_names: "[]",
				meta: "{}",
				expires_on: "2027-01-01 00:00:00",
				...ts,
			});
			const id = await insertHost();
			await db(type.table).where("id", id).update({ certificate_id: old });
			// eg. the old certificate's files are missing: nginx rejects every config that uses it
			rejectCertificates.add(old);

			await internal.update(access, { id, certificate_id: "new" });
			assert.equal(dryRuns, 1);
			assert.equal(issued.length, 1);
			assert.equal((await host(id)).certificate_id, issued[0]);
		});

		it("keeps the new certificate when the update goes through", async () => {
			const id = await insertHost();
			await internal.update(access, { id, certificate_id: "new" });
			assert.equal(issued.length, 1);
			assert.deepEqual(deleted, []);
			assert.equal((await host(id)).certificate_id, issued[0]);
			assert.deepEqual(await liveCertificates(), issued);
		});

		if (type.bad.advanced_config) {
			it("refuses a non-admin's advanced config before checking it or requesting a certificate", async () => {
				const id = await insertHost();
				await assert.rejects(
					internal.update(userAccess(), { id, certificate_id: "new", advanced_config: "add_header X-A 1;" }),
					errs.PermissionError,
				);
				assert.deepEqual(issued, []);
				assert.equal(configures, 0);
				const row = await host(id);
				assert.equal(row.certificate_id, 0);
				assert.equal(row.advanced_config, "");
			});

			it("lets a non-admin update a host when the advanced config is left as it is", async () => {
				const id = await insertHost();
				await internal.update(userAccess(), { id, certificate_id: "new", advanced_config: "" });
				assert.equal(issued.length, 1);
				assert.equal((await host(id)).certificate_id, issued[0]);
			});
		}

		if (type.skipsDisabled) {
			it("skips the check for a disabled host, as the update does", async () => {
				const id = await insertHost(0);
				await internal.update(access, { id, certificate_id: "new", ...type.bad });
				assert.equal(dryRuns, 0);
				assert.equal(issued.length, 1);
			});
		}
	});
}

let nextDomain = 1;

for (const type of types) {
	describe(`${type.name} create with a new certificate`, () => {
		let internal;
		const nextCertificate = async () => ((await db("certificate").max("id as id").first()).id || 0) + 1;
		const liveHosts = async () => (await db(type.table).where("is_deleted", 0)).map((h) => h.id);
		const create = () =>
			internal.create(access, { ...type.create(`create-${nextDomain++}.example.com`), certificate_id: "new" });

		before(async () => {
			internal = await load(type.module);
		});
		beforeEach(async () => {
			issued = [];
			deleted = [];
			dryRuns = 0;
			configures = 0;
			rejectCertificates = new Set();
			afterIssue = null;
			await db(type.table).update({ is_deleted: 1 });
		});
		afterEach(async () => {
			await db("certificate").update({ is_deleted: 1 });
			await db(type.table).update({ is_deleted: 1 });
		});

		it("removes the host and the new certificate when nginx only rejects the host with it", async () => {
			// eg. an advanced ssl_session_cache that only conflicts with the one _certificates.conf adds
			const next = await nextCertificate();
			rejectCertificates.add(next);

			await assert.rejects(create(), errs.NginxConfigError);
			assert.equal(dryRuns, 1);
			assert.deepEqual(issued, [next]);
			assert.deepEqual(await liveHosts(), []);
			assert.deepEqual(deleted, [next]);
			assert.deepEqual(await liveCertificates(), []);
		});

		it("keeps the new certificate when another host uses it meanwhile", async () => {
			const next = await nextCertificate();
			rejectCertificates.add(next);
			const [other] = await db("dead_host").insert({
				owner_user_id: 1,
				certificate_id: 0,
				enabled: 1,
				meta: "{}",
				domain_names: JSON.stringify([`other-${nextDomain++}.example.com`]),
				advanced_config: "",
				...ts,
			});
			afterIssue = async (id) => db("dead_host").where("id", other).update({ certificate_id: id });

			try {
				await assert.rejects(create(), errs.NginxConfigError);
				assert.deepEqual(await liveHosts(), type.table === "dead_host" ? [other] : []);
				assert.deepEqual(deleted, []);
				assert.deepEqual(await liveCertificates(), [next]);
			} finally {
				await db("dead_host").where("id", other).update({ is_deleted: 1 });
			}
		});

		it("keeps the host and the new certificate when the create goes through", async () => {
			const row = await create();
			assert.equal(issued.length, 1);
			assert.equal(row.certificate_id, issued[0]);
			assert.deepEqual(deleted, []);
			assert.deepEqual(await liveCertificates(), issued);
		});
	});
}
