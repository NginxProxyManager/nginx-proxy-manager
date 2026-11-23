// The real configureHost() / healOtherHost() / testAndHeal() against a fake nginx -t: the managed config files
// live in a temporary directory (fs calls for /data/nginx/ are redirected there) and the fake test rejects
// a file with a `tampered` line and a second `listen 80 default_server`, the way nginx does.
import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, before, describe, it } from "node:test";
import { db, load, ts } from "./support/backend.js";

const internalNginx = await load("internal/nginx.js");
const proxyHostModel = await load("models/proxy_host.js");

const root = fs.mkdtempSync(join(tmpdir(), "npm-heal-conflict-"));
const dir = join(root, "data/nginx/proxy_host");
const conf = (id) => `/data/nginx/proxy_host/${id}.conf`;

const real = {};
const FS_METHODS = ["readFileSync", "writeFileSync", "existsSync", "renameSync", "rmSync", "unlinkSync", "readdirSync"];
const redirect = (path) => (typeof path === "string" && path.startsWith("/data/nginx/") ? join(root, path) : path);

// nginx -t over the managed files, in the order nginx reads them
const fakeNginxTest = async () => {
	const files = real
		.readdirSync(dir)
		.filter((f) => /^\d+\.conf$/.test(f))
		.sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
	let defaultServer = false;
	for (const name of files) {
		const lines = real.readFileSync(join(dir, name), "utf8").split("\n");
		for (let i = 0; i < lines.length; i++) {
			const at = `${conf(Number.parseInt(name, 10))}:${i + 1}`;
			if (lines[i].includes("tampered")) {
				throw new Error(
					`nginx: [emerg] unknown directive "tampered" in ${at}\nnginx: configuration file test failed`,
				);
			}
			if (lines[i].includes("listen 80 default_server")) {
				if (defaultServer) {
					throw new Error(
						`nginx: [emerg] a duplicate default server for 0.0.0.0:80 in ${at}\nnginx: configuration file test failed`,
					);
				}
				defaultServer = true;
			}
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
	real.generateConfig = internalNginx.generateConfig;
	internalNginx.test = fakeNginxTest;
	// Writes the config a host's database row renders to, like the real one
	internalNginx.generateConfig = async (_hostType, host) => {
		const text = `server {\n  ${host.advanced_config || "# ok"}\n}\n`;
		fs.writeFileSync(conf(host.id), text);
		return text;
	};
});

after(async () => {
	for (const method of FS_METHODS) {
		fs[method] = real[method];
	}
	internalNginx.test = real.test;
	internalNginx.generateConfig = real.generateConfig;
	fs.rmSync(root, { recursive: true, force: true });
	await db.destroy();
});

let nextId = 1;
/** A host row with the given advanced config; `file` is what is on disk now (null: no file) */
const host = async (advanced, file = null) => {
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
		advanced_config: advanced,
		locations: "[]",
		...ts,
	});
	if (file !== null) {
		fs.writeFileSync(conf(id), file);
	}
	return id;
};
const row = (id) => proxyHostModel.query().where("id", id).first();
const meta = async (id) => JSON.parse((await db("proxy_host").where("id", id).first()).meta);
const onDisk = (id) => (fs.existsSync(conf(id)) ? fs.readFileSync(conf(id), "utf8") : null);
const aside = (id) => fs.existsSync(`${conf(id)}.err`);
const TAMPERED = "server {\n  tampered on;\n}\n";
const DEFAULT_SERVER = "listen 80 default_server;";

describe("a regenerated host that conflicts with another regenerated host", () => {
	// Hosts are created in the order A, B, C: lower ids are read first by the fake nginx
	afterEach(async () => {
		for (const name of real.readdirSync(dir)) {
			real.rmSync(join(dir, name));
		}
		await db("proxy_host").delete();
	});

	it("saving A: C's regenerated config conflicts only with B's, so C goes offline and B stays online", async () => {
		const a = await host("");
		// B and C have valid rows that each claim the default server, both files on disk are broken
		const b = await host(DEFAULT_SERVER, TAMPERED);
		const c = await host(DEFAULT_SERVER, TAMPERED);

		await internalNginx.configure(proxyHostModel, "proxy_host", await row(a), { reload: false });

		assert.equal((await meta(a)).nginx_online, true);
		assert.match(onDisk(b), /default_server/, "B keeps its regenerated config");
		assert.equal(aside(b), false);
		assert.equal((await meta(b)).nginx_online, true);
		assert.equal(onDisk(c), null);
		assert.equal(aside(c), true, "C is moved aside");
		const cMeta = await meta(c);
		assert.equal(cMeta.nginx_online, false);
		assert.match(cMeta.nginx_err, /regenerated configuration conflicts with the configuration of another host/);
		assert.equal(cMeta.nginx_details.scope, "other_host");
		await fakeNginxTest();
	});

	it("startup / reload test: the same conflict takes C offline, not B", async () => {
		const b = await host(DEFAULT_SERVER, TAMPERED);
		const c = await host(DEFAULT_SERVER, TAMPERED);

		await internalNginx.withLock(() => internalNginx.testAndHeal());

		assert.equal((await meta(b)).nginx_online, true);
		assert.match(onDisk(b), /default_server/);
		assert.equal(aside(c), true);
		assert.equal((await meta(c)).nginx_online, false);
		await fakeNginxTest();
	});

	it("saving A: D's regenerated config conflicts with B's, two levels up, so only D goes offline", async () => {
		// A heals B, B heals C, C heals D; D's regenerated config conflicts with B's (not with C's, not with A's)
		const a = await host("");
		const b = await host(DEFAULT_SERVER, TAMPERED);
		const c = await host("", TAMPERED);
		const d = await host(DEFAULT_SERVER, TAMPERED);

		await internalNginx.configure(proxyHostModel, "proxy_host", await row(a), { reload: false });

		assert.equal((await meta(a)).nginx_online, true);
		for (const id of [b, c]) {
			assert.equal(aside(id), false);
			assert.equal((await meta(id)).nginx_online, true);
		}
		assert.match(onDisk(b), /default_server/, "B keeps its regenerated config");
		assert.equal(aside(d), true, "D is moved aside");
		const dMeta = await meta(d);
		assert.equal(dMeta.nginx_online, false);
		assert.match(dMeta.nginx_err, /regenerated configuration conflicts with the configuration of another host/);
		await fakeNginxTest();
	});

	it("startup / reload test: a conflict with a host two levels up takes the newcomer offline, not the root", async () => {
		const b = await host(DEFAULT_SERVER, TAMPERED);
		const c = await host("", TAMPERED);
		const d = await host(DEFAULT_SERVER, TAMPERED);

		await internalNginx.withLock(() => internalNginx.testAndHeal());

		for (const id of [b, c]) {
			assert.equal(aside(id), false);
			assert.equal((await meta(id)).nginx_online, true);
		}
		assert.match(onDisk(b), /default_server/);
		assert.equal(aside(d), true);
		const dMeta = await meta(d);
		assert.equal(dMeta.nginx_online, false);
		assert.match(dMeta.nginx_err, /regenerated configuration conflicts/);
		await fakeNginxTest();
	});

	it("saving A: C's regenerated config conflicts with A's change, so the save fails and nobody goes offline", async () => {
		const a = await host(DEFAULT_SERVER);
		const b = await host("", TAMPERED);
		const c = await host(DEFAULT_SERVER, TAMPERED);

		await assert.rejects(
			internalNginx.configure(proxyHostModel, "proxy_host", await row(a), { reload: false }),
			(err) =>
				err.details?.scope === "host" &&
				err.details.host_id === a &&
				/conflicts with the configuration of another host/.test(err.message),
		);

		assert.equal(onDisk(a), null, "A's new config is taken out again");
		for (const id of [b, c]) {
			assert.equal(aside(id), false);
			assert.notEqual((await meta(id)).nginx_online, false);
			assert.equal(onDisk(id), TAMPERED, "the file is put back as it was");
		}
	});
});
