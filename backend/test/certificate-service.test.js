import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import { mkdtemp } from "node:fs/promises";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const testRoot = await mkdtemp(path.join(os.tmpdir(), "npm-certificate-test-"));
process.env.NPM_KEYS_FILE = path.join(testRoot, "keys.json");
process.env.DB_SQLITE_FILE = path.join(testRoot, "database.sqlite");

const [
	{ default: service },
	{ default: certificateModel },
	{ default: audit },
	{ default: nginx },
	{ default: utils },
	{ default: hostService },
	{ default: userModel },
] = await Promise.all([
	import("../internal/certificate.js"),
	import("../models/certificate.js"),
	import("../internal/audit-log.js"),
	import("../internal/nginx.js"),
	import("../lib/utils.js"),
	import("../internal/host.js"),
	import("../models/user.js"),
]);

const access = (visibility = "all") => ({
	can: async () => ({ permission_visibility: visibility }),
	token: { getUserId: () => 9 },
});

test("certificate creation handles custom and DNS-challenge certificates", async () => {
	const originals = {
		query: certificateModel.query,
		userQuery: userModel.query,
		hosts: hostService.getHostsWithDomains,
		disable: service.disableInUseHosts,
		enable: service.enableInUseHosts,
		requestDns: service.requestLetsEncryptSslWithDnsChallenge,
		info: service.getCertificateInfoFromFile,
		audit: service.addCreatedAuditLog,
		reload: nginx.reload,
	};
	const operations = [];
	let next = null;
	certificateModel.query = () => ({
		insertAndFetch: async (data) => ({ id: 4, ...data, meta: data.meta || {} }),
		patchAndFetchById: async (_id, data) => ({ id: 4, ...next, ...data }),
		deleteById: async (id) => operations.push(["delete", id]),
	});
	service.addCreatedAuditLog = async (_access, id, meta) => operations.push(["audit", id, meta]);
	try {
		next = { provider: "other", nice_name: "Custom", meta: {} };
		const custom = await service.create(access(), { provider: "other", nice_name: "Custom", meta: {} });
		assert.equal(custom.owner_user_id, 9);
		assert.equal(operations[0][0], "audit");

		next = { provider: "letsencrypt", domain_names: ["example.test"], meta: { dns_challenge: true } };
		hostService.getHostsWithDomains = async () => ({ total_count: 0, proxy_hosts: [], redirection_hosts: [], dead_hosts: [] });
		service.disableInUseHosts = async () => operations.push(["disable"]);
		service.enableInUseHosts = async () => operations.push(["enable"]);
		userModel.query = () => {
			const chain = { where: () => chain, andWhere: () => chain, first: async () => ({ email: "owner@example.test" }) };
			return chain;
		};
		nginx.reload = async () => operations.push(["reload"]);
		service.requestLetsEncryptSslWithDnsChallenge = async () => operations.push(["request-dns"]);
		service.getCertificateInfoFromFile = async () => ({ dates: { to: 2_000_000_000 }, cn: "example.test" });
		const le = await service.create(access(), { provider: "letsencrypt", domain_names: ["example.test"], meta: { dns_challenge: true } });
		assert.equal(le.id, 4);
		assert.ok(operations.some((item) => item[0] === "request-dns"));
		assert.ok(operations.some((item) => item[0] === "enable"));

		userModel.query = () => {
			const chain = { where: () => chain, andWhere: () => chain, first: async () => null };
			return chain;
		};
		await assert.rejects(() => service.create(access(), { provider: "letsencrypt", domain_names: ["invalid.test"], meta: { dns_challenge: true } }), /valid email/);
		assert.ok(operations.some((item) => item[0] === "delete"));
	} finally {
		certificateModel.query = originals.query;
		userModel.query = originals.userQuery;
		hostService.getHostsWithDomains = originals.hosts;
		service.disableInUseHosts = originals.disable;
		service.enableInUseHosts = originals.enable;
		service.requestLetsEncryptSslWithDnsChallenge = originals.requestDns;
		service.getCertificateInfoFromFile = originals.info;
		service.addCreatedAuditLog = originals.audit;
		nginx.reload = originals.reload;
	}
});

test("certificate renewal scheduler serializes expiring certificates", async () => {
	const originals = { query: certificateModel.query, renew: service.renew, interval: service.interval, processing: service.intervalProcessing };
	const renewed = [];
	certificateModel.query = () => {
		const chain = { where: () => chain, andWhere: () => chain, then: (resolve, reject) => Promise.resolve([{ id: 1 }, { id: 2 }]).then(resolve, reject) };
		return chain;
	};
	service.renew = async (_access, data) => renewed.push(data.id);
	service.intervalProcessing = false;
	try {
		service.processExpiringHosts();
		await new Promise((resolve) => setImmediate(resolve));
		await new Promise((resolve) => setImmediate(resolve));
		assert.deepEqual(renewed, [1, 2]);
		assert.equal(service.intervalProcessing, false);
		service.intervalProcessing = true;
		service.processExpiringHosts();
		assert.deepEqual(renewed, [1, 2]);
	} finally {
		certificateModel.query = originals.query;
		service.renew = originals.renew;
		service.interval = originals.interval;
		service.intervalProcessing = originals.processing;
	}
});

test("certificate metadata, validation and upload helpers sanitize certificate material", async () => {
	const meta = { certificate: "CERT", certificate_key: "KEY", intermediate_certificate: "CHAIN", dns_provider_credentials: "SECRET" };
	assert.deepEqual(service.cleanMeta({ ...meta }), { certificate: true, certificate_key: true, intermediate_certificate: true, dns_provider_credentials: "SECRET" });
	assert.deepEqual(service.cleanMeta({ ...meta }, true), { dns_provider_credentials: "SECRET" });
	assert.equal(service.getLiveCertPath(12), "/etc/letsencrypt/live/npm-12");

	const originals = { key: service.checkPrivateKey, info: service.getCertificateInfo, get: service.get, validate: service.validate, update: service.update, write: service.writeCustomCert };
	service.checkPrivateKey = async () => true;
	service.getCertificateInfo = async (content) => ({ cn: content, dates: { to: 2_000_000_000 } });
	try {
		const result = await service.validate({ files: {
			certificate: { data: Buffer.from("example.test") },
			certificate_key: { data: Buffer.from("key") },
			ignored: { data: Buffer.from("ignored") },
		} });
		assert.equal(result.certificate.cn, "example.test");
		assert.equal(result.certificate_key, true);

		service.get = async () => ({ id: 4, provider: "letsencrypt", meta: {} });
		await assert.rejects(() => service.upload(access(), { id: 4, files: {} }), /Cannot upload/);
		service.get = async () => ({ id: 4, provider: "other", meta: {} });
		service.validate = async () => ({ certificate_key: true });
		await assert.rejects(() => service.upload(access(), { id: 4, files: {} }), /not provided/);
		service.validate = async () => ({ certificate: { cn: "new.example.test", dates: { to: 2_000_000_000 } } });
		service.update = async (_access, data) => ({ ...data, provider: "other" });
		service.writeCustomCert = async (certificate) => assert.equal(certificate.meta.certificate, "CERT");
		const uploaded = await service.upload(access(), { id: 4, files: { certificate: { data: Buffer.from("CERT") }, certificate_key: { data: Buffer.from("KEY") } } });
		assert.deepEqual(uploaded, { certificate: "CERT", certificate_key: "KEY" });
	} finally {
		service.checkPrivateKey = originals.key;
		service.getCertificateInfo = originals.info;
		service.get = originals.get;
		service.validate = originals.validate;
		service.update = originals.update;
		service.writeCustomCert = originals.write;
	}
});

test("certificate read, update, delete, list and count flows apply visibility and audit rules", async () => {
	const originals = { query: certificateModel.query, get: service.get, revoke: service.revokeLetsEncryptSsl, audit: audit.add };
	let result = { id: 4, owner_user_id: 9, provider: "other", nice_name: "Custom", meta: { certificate: "secret" }, proxy_hosts: [{ id: 1, is_deleted: 0 }] };
	const operations = [];
	certificateModel.query = () => {
		const chain = {
			where: (...args) => { operations.push(["where", ...args]); return chain; },
			andWhere: (...args) => { operations.push(["andWhere", ...args]); return chain; },
			allowGraph: () => chain,
			withGraphFetched: () => chain,
			groupBy: () => chain,
			orderBy: () => { result = [result]; return chain; },
			first: () => chain,
			count: () => { result = { count: "3" }; return chain; },
			patchAndFetchById: async (_id, data) => ({ id: 4, provider: "other", nice_name: "Custom", meta: data.meta || {}, ...data }),
			patch: async (data) => { operations.push(["patch", data]); return 1; },
			then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
		};
		return chain;
	};
	audit.add = async (_access, data) => operations.push(["audit", data]);
	service.revokeLetsEncryptSsl = async () => operations.push(["revoke"]);
	try {
		const row = await service.get(access("user"), { id: 4, expand: ["proxy_hosts"] });
		assert.equal(row.proxy_hosts[0].is_deleted, undefined);
		assert.ok(operations.some((item) => item[0] === "andWhere" && item[1] === "owner_user_id"));
		result = { id: 4, email: "hidden" };
		assert.equal((await service.get(access(), { id: 4, omit: ["email"] })).email, undefined);

		service.get = async () => ({ id: 4, provider: "other", nice_name: "Custom", meta: { certificate: "secret" } });
		const updated = await service.update(access(), { id: 4, meta: { certificate: "secret" } });
		assert.equal(updated.meta.certificate, true);
		assert.ok(operations.some((item) => item[0] === "audit" && item[1].action === "updated"));
		assert.equal(await service.delete(access(), { id: 4 }), true);
		assert.deepEqual(operations.find((item) => item[0] === "patch")[1], { is_deleted: 1 });

		result = { id: 5, provider: "letsencrypt", nice_name: "LE", meta: {} };
		service.get = async () => result;
		await service.delete(access(), { id: 5 });
		assert.ok(operations.some((item) => item[0] === "revoke"));

		result = { id: 4, provider: "other", nice_name: "Custom", meta: {}, dead_hosts: [{ id: 2, is_deleted: 0 }] };
		const list = await service.getAll(access("user"), ["dead_hosts"], "Custom");
		assert.equal(list[0].dead_hosts[0].is_deleted, undefined);
		result = { count: "3" };
		assert.equal(await service.getCount(9, "user"), 3);
	} finally {
		certificateModel.query = originals.query;
		service.get = originals.get;
		service.revokeLetsEncryptSsl = originals.revoke;
		audit.add = originals.audit;
	}
});

test("certificate OpenSSL parser returns certificate identity and rejects invalid or expired data", async () => {
	const originalExecFile = utils.execFile;
	let call = 0;
	utils.execFile = async () => [
		"subject=CN = example.test",
		"issuer=C = US, O = Example CA",
		"notBefore=Jan 01 00:00:00 2025 GMT\nnotAfter=Jan 01 00:00:00 2035 GMT",
	][call++];
	try {
		const info = await service.getCertificateInfoFromFile("cert.pem", true);
		assert.equal(info.cn, "example.test");
		assert.match(info.issuer, /Example CA/);
		assert.ok(info.dates.to > info.dates.from);
		call = 0;
		utils.execFile = async () => ["subject=CN = expired.test", "issuer=Example", "notBefore=Jan 01 00:00:00 2020 GMT\nnotAfter=Jan 01 00:00:00 2021 GMT"][call++];
		await assert.rejects(() => service.getCertificateInfoFromFile("expired.pem", true), /expired/);
		utils.execFile = async () => { throw new Error("bad pem"); };
		await assert.rejects(() => service.getCertificateInfoFromFile("bad.pem"), /not valid/);
	} finally {
		utils.execFile = originalExecFile;
	}
});

test("certificate renewal and certbot command helpers select HTTP and DNS behavior", async () => {
	const originals = { execFile: utils.execFile, exec: utils.exec, additional: service.getAdditionalCertbotArgs, get: service.get, renewHttp: service.renewLetsEncryptSsl, renewDns: service.renewLetsEncryptSslWithDnsChallenge, info: service.getCertificateInfoFromFile, query: certificateModel.query, audit: audit.add };
	const commands = [];
	utils.execFile = async (command, args, opts) => { commands.push({ command, args, opts }); return "ok"; };
	utils.exec = async (command) => commands.push({ command });
	service.getAdditionalCertbotArgs = () => ({ args: ["--staging"], opts: { env: { TEST: "1" } } });
	try {
		const cert = { id: 4, domain_names: ["example.test"], meta: { key_type: "ecdsa", dns_provider: "cloudflare" } };
		assert.equal(await service.requestLetsEncryptSsl(cert, "owner@example.test"), "ok");
		assert.ok(commands[0].args.includes("webroot"));
		assert.ok(commands[0].args.includes("ecdsa"));
		assert.equal(await service.renewLetsEncryptSsl(cert), "ok");
		assert.ok(commands[1].args.includes("--force-renewal"));
		assert.equal(await service.renewLetsEncryptSslWithDnsChallenge(cert), "ok");
		assert.ok(commands[2].args.includes("dns"));
		await assert.rejects(() => service.renewLetsEncryptSslWithDnsChallenge({ ...cert, meta: { dns_provider: "missing" } }), /Unknown DNS/);
		assert.equal(await service.revokeLetsEncryptSsl(cert, true), "ok");
		assert.ok(commands.some((item) => item.args?.includes("revoke")));

		service.get = async () => ({ ...cert, provider: "other" });
		await assert.rejects(() => service.renew(access(), { id: 4 }), /Only Let'sEncrypt/);
		service.get = async () => ({ ...cert, provider: "letsencrypt", meta: { dns_challenge: false } });
		service.renewLetsEncryptSsl = async () => "ok";
		service.getCertificateInfoFromFile = async () => ({ dates: { to: 2_000_000_000 } });
		certificateModel.query = () => ({ patchAndFetchById: async (_id, data) => ({ id: 4, ...data }) });
		audit.add = async () => true;
		assert.equal((await service.renew(access(), { id: 4 })).id, 4);
	} finally {
		utils.execFile = originals.execFile;
		utils.exec = originals.exec;
		service.getAdditionalCertbotArgs = originals.additional;
		service.get = originals.get;
		service.renewLetsEncryptSsl = originals.renewHttp;
		service.renewLetsEncryptSslWithDnsChallenge = originals.renewDns;
		service.getCertificateInfoFromFile = originals.info;
		certificateModel.query = originals.query;
		audit.add = originals.audit;
	}
});

test("certificate host suspension helpers delegate every populated host family", async () => {
	const originals = { del: nginx.bulkDeleteConfigs, add: nginx.bulkGenerateConfigs };
	const calls = [];
	nginx.bulkDeleteConfigs = async (...args) => calls.push(["delete", ...args]);
	nginx.bulkGenerateConfigs = async (...args) => calls.push(["generate", ...args]);
	const inUse = { total_count: 3, proxy_hosts: [1], redirection_hosts: [2], dead_hosts: [3] };
	try {
		await service.disableInUseHosts(inUse);
		await service.enableInUseHosts(inUse);
		await service.disableInUseHosts({ total_count: 0 });
		assert.equal(calls.length, 6);
		assert.deepEqual(calls.map((item) => item[1]), ["proxy_host", "redirection_host", "dead_host", "proxy_host", "redirection_host", "dead_host"]);
	} finally {
		nginx.bulkDeleteConfigs = originals.del;
		nginx.bulkGenerateConfigs = originals.add;
	}
});

test("certificate HTTP creation performs challenge setup, cleanup and host recovery", async () => {
	const originals = {
		query: certificateModel.query,
		userQuery: userModel.query,
		hosts: hostService.getHostsWithDomains,
		disable: service.disableInUseHosts,
		enable: service.enableInUseHosts,
		request: service.requestLetsEncryptSsl,
		info: service.getCertificateInfoFromFile,
		audit: service.addCreatedAuditLog,
		generate: nginx.generateLetsEncryptRequestConfig,
		remove: nginx.deleteLetsEncryptRequestConfig,
		reload: nginx.reload,
		timeout: globalThis.setTimeout,
	};
	const operations = [];
	const cert = { id: 6, provider: "letsencrypt", domain_names: ["http.example"], meta: {} };
	certificateModel.query = () => ({
		insertAndFetch: async () => cert,
		patchAndFetchById: async (_id, data) => ({ ...cert, ...data }),
		deleteById: async () => operations.push("delete-row"),
	});
	userModel.query = () => {
		const chain = { where: () => chain, andWhere: () => chain, first: async () => ({ email: "owner@example.test" }) };
		return chain;
	};
	hostService.getHostsWithDomains = async () => ({ total_count: 0, proxy_hosts: [], redirection_hosts: [], dead_hosts: [] });
	service.disableInUseHosts = async () => operations.push("disable");
	service.enableInUseHosts = async () => operations.push("enable");
	service.requestLetsEncryptSsl = async () => operations.push("request");
	service.getCertificateInfoFromFile = async () => ({ dates: { to: 2_000_000_000 } });
	service.addCreatedAuditLog = async () => operations.push("audit");
	nginx.generateLetsEncryptRequestConfig = async () => operations.push("generate");
	nginx.deleteLetsEncryptRequestConfig = async () => operations.push("remove");
	nginx.reload = async () => operations.push("reload");
	globalThis.setTimeout = () => ({ unref: () => {} });
	try {
		assert.equal((await service.create(access(), { provider: "letsencrypt", domain_names: cert.domain_names, meta: {} })).id, 6);
		assert.deepEqual(operations.slice(0, 6), ["disable", "generate", "reload", "request", "remove", "reload"]);
		service.requestLetsEncryptSsl = async () => { throw new Error("certbot failed"); };
		await assert.rejects(() => service.create(access(), { provider: "letsencrypt", domain_names: cert.domain_names, meta: {} }), /certbot failed/);
		assert.ok(operations.includes("delete-row"));
	} finally {
		certificateModel.query = originals.query;
		userModel.query = originals.userQuery;
		hostService.getHostsWithDomains = originals.hosts;
		service.disableInUseHosts = originals.disable;
		service.enableInUseHosts = originals.enable;
		service.requestLetsEncryptSsl = originals.request;
		service.getCertificateInfoFromFile = originals.info;
		service.addCreatedAuditLog = originals.audit;
		nginx.generateLetsEncryptRequestConfig = originals.generate;
		nginx.deleteLetsEncryptRequestConfig = originals.remove;
		nginx.reload = originals.reload;
		globalThis.setTimeout = originals.timeout;
	}
});

test("certificate remote challenge tester maps successful and failed responses", async () => {
	const originalRequest = https.request;
	const scenarios = [
		{ status: 200, body: { responsecode: 200, htmlresponse: "Success" }, expected: "ok" },
		{ status: 200, body: { responsecode: 200, htmlresponse: "Wrong" }, expected: "wrong-data" },
		{ status: 200, body: { responsecode: 404 }, expected: "404" },
		{ status: 200, body: { responsecode: 0, reason: "Host Unavailable" }, expected: "no-host" },
		{ status: 200, body: { responsecode: 500 }, expected: "other:500" },
		{ status: 200, body: { error: { msg: "blocked" } }, expected: "other:blocked" },
		{ status: 500, body: { message: "upstream error" }, expected: "failed" },
		{ status: 200, raw: "not-json", expected: "failed" },
	];
	try {
		for (const scenario of scenarios) {
			https.request = (_url, _options, callback) => {
				const request = new EventEmitter();
				request.write = () => {};
				request.end = () => queueMicrotask(() => {
					const response = new EventEmitter();
					response.statusCode = scenario.status;
					callback(response);
					response.emit("data", scenario.raw ?? JSON.stringify(scenario.body));
					response.emit("end");
				});
				return request;
			};
			assert.equal(await service.performTestForDomain("example.test"), scenario.expected);
		}
		https.request = () => {
			const request = new EventEmitter();
			request.write = () => {};
			request.end = () => queueMicrotask(() => request.emit("error", new Error("network")));
			return request;
		};
		assert.equal(await service.performTestForDomain("example.test"), "failed");
	} finally {
		https.request = originalRequest;
	}
});

test("certificate file, download, quick-create and challenge helpers cover filesystem orchestration", async () => {
	const originals = {
		exists: fs.existsSync, mkdir: fs.mkdirSync, write: fs.writeFile, writeSync: fs.writeFileSync, unlinkSync: fs.unlinkSync,
		readdir: fs.readdirSync, realpath: fs.realpathSync,
		get: service.get, zip: service.zipFiles, create: service.create, perform: service.performTestForDomain,
	};
	const operations = [];
	fs.existsSync = () => true;
	fs.mkdirSync = (...args) => operations.push(["mkdir", ...args]);
	fs.writeFile = (_file, _content, callback) => callback(null);
	fs.writeFileSync = (...args) => operations.push(["write", ...args]);
	fs.unlinkSync = (...args) => operations.push(["unlink", ...args]);
	fs.readdirSync = () => ["fullchain.pem", "privkey.pem", "README"];
	fs.realpathSync = (value) => value;
	try {
		await service.writeCustomCert({ id: 4, provider: "other", meta: { certificate: "CERT", intermediate_certificate: "CHAIN", certificate_key: "KEY" } });
		await assert.rejects(() => service.writeCustomCert({ id: 4, provider: "letsencrypt", meta: {} }), /Refusing/);

		service.get = async () => ({ id: 4, provider: "other", nice_name: "Custom" });
		await assert.rejects(() => service.download(access(), { id: 4 }), /Only Let'sEncrypt/);
		service.get = async () => ({ id: 4, provider: "letsencrypt", nice_name: "LE" });
		service.zipFiles = async (files, output) => operations.push(["zip", files, output]);
		assert.match((await service.download(access(), { id: 4 })).fileName, /npm-4-\d+\.zip/);
		assert.equal(operations.find((item) => item[0] === "zip")[1].length, 2);

		service.create = async (_access, data) => data;
		assert.equal((await service.createQuickCertificate(access(), { domain_names: ["quick.example"], meta: {} })).provider, "letsencrypt");

		service.performTestForDomain = async (domain) => domain.endsWith("ok") ? "ok" : "failed";
		const challenge = await service.testHttpsChallenge(access(), { domains: ["one.ok", "two.bad"] });
		assert.deepEqual(challenge, { "one.ok": "ok", "two.bad": "failed" });
		assert.ok(operations.some((item) => item[0] === "write"));
		assert.ok(operations.some((item) => item[0] === "unlink"));
	} finally {
		fs.existsSync = originals.exists;
		fs.mkdirSync = originals.mkdir;
		fs.writeFile = originals.write;
		fs.writeFileSync = originals.writeSync;
		fs.unlinkSync = originals.unlinkSync;
		fs.readdirSync = originals.readdir;
		fs.realpathSync = originals.realpath;
		service.get = originals.get;
		service.zipFiles = originals.zip;
		service.create = originals.create;
		service.performTestForDomain = originals.perform;
	}
});

test("certificate DNS request installs provider, writes credentials and builds provider arguments", async () => {
	const originals = {
		mkdir: fs.mkdirSync, write: fs.writeFileSync, unlink: fs.unlink,
		exec: utils.exec, execFile: utils.execFile, additional: service.getAdditionalCertbotArgs,
		certbotVersion: process.env.CERTBOT_VERSION, aws: process.env.AWS_CONFIG_FILE,
	};
	const operations = [];
	process.env.CERTBOT_VERSION = "4.0.0";
	fs.mkdirSync = (...args) => operations.push(["mkdir", ...args]);
	fs.writeFileSync = (...args) => operations.push(["write", ...args]);
	fs.unlink = (...args) => { operations.push(["unlink", ...args]); args.at(-1)?.(); };
	utils.exec = async (command) => { operations.push(["install", command]); return "installed"; };
	utils.execFile = async (_command, args) => { operations.push(["certbot", args]); return "issued"; };
	service.getAdditionalCertbotArgs = () => ({ args: ["--extra"], opts: {} });
	try {
		const result = await service.requestLetsEncryptSslWithDnsChallenge({
			id: 8,
			domain_names: ["dns.example"],
			meta: { dns_provider: "cloudflare", dns_provider_credentials: "token=x", propagation_seconds: 30, key_type: "ecdsa" },
		}, "owner@example.test");
		assert.equal(result, "issued");
		const args = operations.find((item) => item[0] === "certbot")[1];
		assert.ok(args.includes("dns-cloudflare"));
		assert.ok(args.includes("30"));
		assert.ok(args.includes("ecdsa"));
		assert.ok(operations.some((item) => item[0] === "write"));

		utils.execFile = async () => { throw new Error("issue failed"); };
		await assert.rejects(() => service.requestLetsEncryptSslWithDnsChallenge({ id: 9, domain_names: ["dns.example"], meta: { dns_provider: "cloudflare", dns_provider_credentials: "token=x" } }, "owner@example.test"), /issue failed/);
		assert.ok(operations.some((item) => item[0] === "unlink"));

		service.getAdditionalCertbotArgs = originals.additional;
		const duck = service.getAdditionalCertbotArgs(2, "duckdns");
		assert.ok(duck.args.includes("--dns-duckdns-no-txt-restore"));
		const route = service.getAdditionalCertbotArgs(3, "route53");
		assert.match(route.opts.env.AWS_CONFIG_FILE, /credentials-3$/);
	} finally {
		fs.mkdirSync = originals.mkdir;
		fs.writeFileSync = originals.write;
		fs.unlink = originals.unlink;
		utils.exec = originals.exec;
		utils.execFile = originals.execFile;
		service.getAdditionalCertbotArgs = originals.additional;
		if (typeof originals.certbotVersion === "undefined") delete process.env.CERTBOT_VERSION;
		else process.env.CERTBOT_VERSION = originals.certbotVersion;
		if (typeof originals.aws === "undefined") delete process.env.AWS_CONFIG_FILE;
		else process.env.AWS_CONFIG_FILE = originals.aws;
	}
});
