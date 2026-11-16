// Hosts stored with a value that could add nginx directives (saved before the API refused such values, see
// lib/nginx-values.js) against the real configure() and generateConfig(), with a fake nginx -t. The managed
// config files live in a temporary directory (fs calls for /data/nginx/ are redirected there).
import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, before, describe, it } from "node:test";
import { access, db, load, ts } from "./support/backend.js";

const errs = await load("lib/error.js");
const internalNginx = await load("internal/nginx.js");
const internalProxyHost = await load("internal/proxy-host.js");
const internalAuditLog = await load("internal/audit-log.js");
const proxyHostModel = await load("models/proxy_host.js");

const root = fs.mkdtempSync(join(tmpdir(), "npm-unsafe-value-"));
const dir = join(root, "data/nginx/proxy_host");
const conf = (id) => `/data/nginx/proxy_host/${id}.conf`;

const real = {};
const FS_METHODS = ["readFileSync", "writeFileSync", "existsSync", "renameSync", "rmSync", "unlinkSync", "readdirSync"];
const redirect = (path) => (typeof path === "string" && path.startsWith("/data/nginx/") ? join(root, path) : path);

// nginx -t: a managed file containing "tampered" is broken by itself and named by nginx
let reloads = 0;
const fakeNginxTest = async () => {
	for (const f of real.readdirSync(dir).filter((name) => /^\d+\.conf$/.test(name))) {
		if (real.readFileSync(join(dir, f), "utf8").includes("tampered")) {
			throw new Error(
				`nginx: [emerg] unknown directive "tampered" in /data/nginx/proxy_host/${f}:2\nnginx: configuration file /etc/nginx/nginx.conf test failed`,
			);
		}
	}
};

before(() => {
	fs.mkdirSync(dir, { recursive: true });
	for (const method of FS_METHODS) {
		real[method] = fs[method];
		fs[method] =
			method === "renameSync"
				? (from, to) => real.renameSync(redirect(from), redirect(to))
				: (path, ...args) => real[method](redirect(path), ...args);
	}
	real.test = internalNginx.test;
	real.reloadWaiter = internalNginx.reloadWaiter;
	real.audit = internalAuditLog.add;
	internalNginx.test = fakeNginxTest;
	internalNginx.reloadWaiter = {
		reloadAndWait: async () => {
			reloads++;
			return { confirmed: true, waitedMs: 1 };
		},
	};
	internalAuditLog.add = async () => {};
});

after(async () => {
	for (const method of FS_METHODS) {
		fs[method] = real[method];
	}
	internalNginx.test = real.test;
	internalNginx.reloadWaiter = real.reloadWaiter;
	internalAuditLog.add = real.audit;
	fs.rmSync(root, { recursive: true, force: true });
	await db.destroy();
});

const INJECTED = "app; include /etc/passwd";
const OLD_CONFIG = `server {\n  proxy_pass http://${INJECTED}:80;\n}\n`;

let nextId = 1;
const host = async (fields = {}, file = null) => {
	const id = nextId++;
	await db("proxy_host").insert({
		id,
		owner_user_id: 1,
		certificate_id: 0,
		enabled: 1,
		meta: "{}",
		domain_names: JSON.stringify([`h${id}.example.com`]),
		forward_scheme: "http",
		forward_host: "app",
		forward_port: 80,
		access_list_id: 0,
		advanced_config: "",
		locations: "[]",
		...ts,
		...fields,
	});
	if (file !== null) {
		fs.writeFileSync(conf(id), file);
	}
	return id;
};
const row = (id) => proxyHostModel.query().where("id", id).first();
const onDisk = (id) => (fs.existsSync(conf(id)) ? fs.readFileSync(conf(id), "utf8") : null);
const errOnDisk = (id) => fs.existsSync(`${conf(id)}.err`);

const assertOffline = async (id, pattern) => {
	const meta = (await row(id)).meta;
	assert.equal(meta.nginx_online, false);
	assert.match(meta.nginx_err, pattern);
	assert.equal(meta.nginx_details.kind, "unsafe_value");
	assert.equal(onDisk(id), null);
	assert.equal(errOnDisk(id), false);
};

describe("a host stored with a value that could add nginx directives", () => {
	afterEach(async () => {
		for (const name of real.readdirSync(dir)) {
			real.rmSync(join(dir, name));
		}
		await db("proxy_host").delete();
		await db("access_list_client").delete();
		await db("access_list").delete();
		reloads = 0;
	});

	it("goes offline on save: its old config is removed, not put back, and nginx reloads", async () => {
		const id = await host({ forward_host: INJECTED }, OLD_CONFIG);
		fs.writeFileSync(`${conf(id)}.err`, OLD_CONFIG);
		const meta = await internalNginx.configure(proxyHostModel, "proxy_host", await row(id));
		assert.equal(meta.nginx_online, false);
		await assertOffline(id, /forward host .* is not allowed in nginx config/);
		// the UI words it from the field, the value is shown as it is
		const { nginx_details: details } = (await row(id)).meta;
		assert.equal(details.field, "forward_host");
		assert.equal(details.detail, JSON.stringify(INJECTED));
		assert.equal(reloads, 1);
	});

	it("keeps an update of another field and returns the host as offline", async () => {
		const id = await host({ forward_host: INJECTED }, OLD_CONFIG);
		const saved = await internalProxyHost.update(access, { id, forward_port: 8080 });
		assert.equal(saved.meta.nginx_online, false);
		assert.equal((await row(id)).forward_port, 8080);
		await assertOffline(id, /forward host/);
	});

	it("is reported by a dry run without touching its files or meta", async () => {
		const id = await host({ forward_host: INJECTED }, OLD_CONFIG);
		await assert.rejects(
			internalNginx.configure(proxyHostModel, "proxy_host", await row(id), { dryRun: true }),
			(err) => {
				assert.ok(err instanceof errs.ConfigurationError);
				assert.equal(err.unsafeNginxValue, true);
				assert.ok(internalNginx.isHostLevelError(err));
				return true;
			},
		);
		assert.equal(onDisk(id), OLD_CONFIG);
		assert.deepEqual((await row(id)).meta, {});
		assert.equal(reloads, 0);
	});

	it("goes offline in a bulk regeneration, which carries on with the other hosts", async () => {
		const bad = await host({ domain_names: JSON.stringify(["a.example.com;"]) }, OLD_CONFIG);
		const good = await host();
		await internalNginx.bulkGenerateConfigs("proxy_host", [{ id: bad }, { id: good }]);
		await assertOffline(bad, /domain name/);
		assert.match(onDisk(good), /server_name h\d+\.example\.com;/);
		// the caller reloads
		assert.equal(reloads, 0);
	});

	it("is counted offline by the startup reconcile", async () => {
		const bad = await host({ forward_host: INJECTED });
		const good = await host();
		const summary = await internalNginx.reconcile();
		assert.equal(summary.offline, 1);
		assert.equal(summary.regenerated, 1);
		assert.equal(summary.failed, 0);
		await assertOffline(bad, /forward host/);
		assert.ok(onDisk(good));
		assert.equal(reloads, 1);
	});

	it("goes offline when it is repaired while another host is saved", async () => {
		const broken = await host({ forward_host: INJECTED }, "server {\n  tampered;\n}\n");
		const id = await host();
		const meta = await internalNginx.configure(proxyHostModel, "proxy_host", await row(id));
		assert.equal(meta.nginx_online, true);
		await assertOffline(broken, /forward host/);
		assert.ok(onDisk(id));
	});

	// Locations render prepareLocation()'s output (trimmed), so that is what is checked
	const loc = (o) => ({ path: "/x", forward_scheme: "http", forward_host: "app", forward_port: 80, ...o });

	it("renders a legacy location with whitespace around its values on the startup reconcile", async () => {
		const id = await host({
			locations: JSON.stringify([loc({ path: " /api ", forward_host: "app ", forward_path: " /v1 " })]),
		});
		const summary = await internalNginx.reconcile();
		assert.equal(summary.offline, 0);
		assert.equal(summary.regenerated, 1);
		const meta = (await row(id)).meta;
		assert.equal(meta.nginx_online, true);
		assert.equal(meta.nginx_details?.kind === "unsafe_value", false);
		assert.equal(meta.nginx_locations[0].status, "ok");
		assert.match(onDisk(id), /location \/api \{/);
	});

	it("quarantines a legacy location with an empty path or forward host on its own, also when disabled", async () => {
		const id = await host({
			locations: JSON.stringify([
				loc({ path: "/ok" }),
				loc({ path: "  " }),
				loc({ path: "/nohost", forward_host: " " }),
				loc({ path: "", forward_host: "", enabled: false }),
			]),
		});
		const meta = await internalNginx.configure(proxyHostModel, "proxy_host", await row(id));
		assert.equal(meta.nginx_online, true);
		assert.deepEqual(
			meta.nginx_locations.map((s) => s.status),
			["ok", "quarantined", "quarantined", "disabled"],
		);
		assert.ok(onDisk(id));
	});

	it("still goes offline for a location value that is unsafe once trimmed", async () => {
		const id = await host(
			{ locations: JSON.stringify([loc({ path: " /x { return 200; } location /y " })]) },
			OLD_CONFIG,
		);
		await internalNginx.configure(proxyHostModel, "proxy_host", await row(id));
		await assertOffline(id, /location path .* is not allowed in nginx config/);
		const { nginx_details: details } = (await row(id)).meta;
		assert.equal(details.field, "location_path");
		assert.equal(details.detail, JSON.stringify("/x { return 200; } location /y"));
	});

	it("goes offline for a location's access list client address, with the flag kept", async () => {
		const [listId] = await db("access_list").insert({ owner_user_id: 1, name: "l", meta: "{}", ...ts });
		await db("access_list_client").insert({
			access_list_id: listId,
			address: "1.2.3.4; allow all",
			directive: "allow",
			meta: "{}",
			...ts,
		});
		const id = await host(
			{
				locations: JSON.stringify([
					{ path: "/x", forward_scheme: "http", forward_host: "app", forward_port: 80, access_list_id: listId },
				]),
			},
			OLD_CONFIG,
		);
		await internalNginx.configure(proxyHostModel, "proxy_host", await row(id));
		await assertOffline(id, /location \/x: access list client address/);
		assert.equal((await row(id)).meta.nginx_details.field, "access_list_client_address");
	});
});
