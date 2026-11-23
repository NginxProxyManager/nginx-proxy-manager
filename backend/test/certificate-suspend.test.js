// A certificate request with the HTTP challenge removes the configs of the hosts that use its domains until
// the request is done (nginx would otherwise send the challenge requests to their upstream). Nothing may
// recreate them in the meantime: not the startup reconcile, not a bulk regeneration (eg. an access list
// change). The managed config files live in a temporary directory, fs calls for /data/nginx/ go there.
import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, before, it } from "node:test";
import { access, db, load, ts } from "./support/backend.js";

const internalNginx = await load("internal/nginx.js");
const internalCertificate = await load("internal/certificate.js");
const internalAuditLog = await load("internal/audit-log.js");

const root = fs.mkdtempSync(join(tmpdir(), "npm-cert-suspend-"));
const conf = (id) => `/data/nginx/proxy_host/${id}.conf`;
const real = {};
const FS_METHODS = ["readFileSync", "writeFileSync", "existsSync", "renameSync", "rmSync", "unlinkSync", "readdirSync"];
const redirect = (path) => (typeof path === "string" && path.startsWith("/data/nginx/") ? join(root, path) : path);
const STUBBED = [
	"test",
	"generateConfig",
	"reloadNginx",
	"reload",
	"generateLetsEncryptRequestConfig",
	"deleteLetsEncryptRequestConfig",
];
const CERT_STUBBED = ["requestLetsEncryptSsl", "getCertificateInfoFromFile"];

before(() => {
	for (const type of ["proxy_host", "redirection_host", "dead_host", "stream"]) {
		fs.mkdirSync(join(root, "data/nginx", type), { recursive: true });
	}
	for (const method of FS_METHODS) {
		real[method] = fs[method];
		fs[method] =
			method === "renameSync"
				? (from, to) => real.renameSync(redirect(from), redirect(to))
				: (path, ...args) => real[method](redirect(path), ...args);
	}
	for (const name of STUBBED) {
		real[name] = internalNginx[name];
	}
	for (const name of CERT_STUBBED) {
		real[name] = internalCertificate[name];
	}
	real.audit = internalAuditLog.add;
	internalAuditLog.add = async () => {};
	internalNginx.test = async () => {};
	internalNginx.generateConfig = async (_hostType, host) => {
		const text = `server {\n  # host ${host.id}\n}\n`;
		fs.writeFileSync(conf(host.id), text);
		return text;
	};
	internalNginx.reloadNginx = async () => {
		return { confirmed: true };
	};
	internalNginx.reload = () => internalNginx.withLock(() => internalNginx.reloadNginx());
	internalNginx.generateLetsEncryptRequestConfig = async () => {};
	internalNginx.deleteLetsEncryptRequestConfig = async () => {};
	internalCertificate.getCertificateInfoFromFile = async () => ({ dates: { to: 1830297600 } });
});

after(async () => {
	for (const method of FS_METHODS) {
		fs[method] = real[method];
	}
	for (const name of STUBBED) {
		internalNginx[name] = real[name];
	}
	for (const name of CERT_STUBBED) {
		internalCertificate[name] = real[name];
	}
	internalAuditLog.add = real.audit;
	fs.rmSync(root, { recursive: true, force: true });
	await db.destroy();
});

afterEach(async () => {
	for (const name of real.readdirSync(join(root, "data/nginx/proxy_host"))) {
		real.rmSync(join(root, "data/nginx/proxy_host", name));
	}
	await db("proxy_host").delete();
	await db("certificate").delete();
	await db("user").where("id", 1).update({ email: "admin@example.com" });
});

let nextId = 1;
/** An enabled proxy host whose config is on disk */
const host = async (domain) => {
	const id = nextId++;
	await db("proxy_host").insert({
		id,
		owner_user_id: 1,
		certificate_id: 0,
		enabled: 1,
		meta: "{}",
		domain_names: JSON.stringify([domain]),
		forward_scheme: "http",
		forward_host: "app",
		forward_port: 80,
		access_list_id: 0,
		advanced_config: "",
		locations: "[]",
		...ts,
	});
	fs.writeFileSync(conf(id), "server {\n}\n");
	return id;
};
const onDisk = (id) => fs.existsSync(conf(id));

const createCertificate = (domain) =>
	internalCertificate.create(access, {
		provider: "letsencrypt",
		domain_names: [domain],
		meta: {},
	});

it("the startup reconcile and a bulk regeneration leave a host alone while its certificate is requested", async () => {
	const a = await host("cert.example.com");
	const other = await host("other.example.com");
	fs.rmSync(conf(other));
	const during = [];
	internalCertificate.requestLetsEncryptSsl = async () => {
		// the startup check fires while certbot waits for the challenge
		const summary = await internalNginx.reconcile();
		during.push({ summary, a: onDisk(a), other: onDisk(other) });
		// eg. an access list change regenerates its hosts
		await internalNginx.bulkGenerateConfigs("proxy_host", [{ id: a }]);
		during.push({ a: onDisk(a) });
	};

	await createCertificate("cert.example.com");

	assert.equal(during[0].a, false, "reconcile must not recreate the host removed for the challenge");
	assert.equal(during[0].other, true, "reconcile still repairs other hosts");
	assert.equal(during[0].summary.suspended, 1);
	assert.equal(during[0].summary.regenerated, 1);
	assert.equal(during[1].a, false, "bulkGenerateConfigs must not recreate it either");
	assert.equal(onDisk(a), true, "the host is configured again once the request is done");
	assert.equal(internalNginx.isSuspended("proxy_host", a), false);
});

it("regenerating all host configs leaves a host alone while its certificate is requested and reports it", async () => {
	const a = await host("regen-cert.example.com");
	const other = await host("regen-other.example.com");
	fs.rmSync(conf(other));
	let during = null;
	internalCertificate.requestLetsEncryptSsl = async () => {
		// Settings > Nginx Configuration > Regenerate all host configs while certbot waits for the challenge
		const summary = await internalNginx.regenerateAll();
		during = { summary, a: onDisk(a), other: onDisk(other) };
	};

	await createCertificate("regen-cert.example.com");

	assert.equal(during.a, false, "regenerateAll must not recreate the host removed for the challenge");
	assert.equal(during.other, true, "regenerateAll still rewrites the other hosts");
	assert.equal(during.summary.checked, 1);
	assert.equal(during.summary.regenerated, 1);
	assert.deepEqual(
		during.summary.skipped.map((s) => [s.host_type, s.id, s.name]),
		[["proxy_host", a, "regen-cert.example.com"]],
	);
	assert.equal(onDisk(a), true, "the host is configured again once the request is done");
});

it("ends the suspension when the certificate request fails", async () => {
	const a = await host("fail.example.com");
	internalCertificate.requestLetsEncryptSsl = async () => {
		assert.equal(internalNginx.isSuspended("proxy_host", a), true);
		throw new Error("certbot failed");
	};
	await assert.rejects(createCertificate("fail.example.com"), /certbot failed/);
	assert.equal(internalNginx.isSuspended("proxy_host", a), false);
	assert.equal(onDisk(a), true);

	// and the next reconcile treats the host like any other
	fs.rmSync(conf(a));
	const summary = await internalNginx.reconcile();
	assert.equal(summary.suspended, 0);
	assert.equal(onDisk(a), true);
});

it("does not take the hosts offline when the user has no email address", async () => {
	const a = await host("noemail.example.com");
	await db("user").where("id", 1).update({ email: "" });
	internalCertificate.requestLetsEncryptSsl = async () => {
		throw new Error("must not be called");
	};
	await assert.rejects(createCertificate("noemail.example.com"), /valid email address/);
	assert.equal(onDisk(a), true);
	assert.equal(internalNginx.isSuspended("proxy_host", a), false);
});

it("keeps a host suspended until every request that suspended it is done", () => {
	const first = internalNginx.suspendHosts("proxy_host", [{ id: 99 }]);
	const second = internalNginx.suspendHosts("proxy_host", [{ id: 99 }]);
	first();
	first();
	assert.equal(internalNginx.isSuspended("proxy_host", 99), true);
	second();
	assert.equal(internalNginx.isSuspended("proxy_host", 99), false);
});
