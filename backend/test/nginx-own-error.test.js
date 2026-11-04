// The real configure() against a fake nginx -t that reports an error without file or line, the way nginx
// reports an unknown variable (it checks variables after reading all files). The managed config files live in a
// temporary directory (fs calls for /data/nginx/ are redirected there).
import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, before, describe, it } from "node:test";
import { db, load, ts } from "./support/backend.js";

const internalNginx = await load("internal/nginx.js");
const proxyHostModel = await load("models/proxy_host.js");

const root = fs.mkdtempSync(join(tmpdir(), "npm-own-error-"));
const dir = join(root, "data/nginx/proxy_host");
const conf = (id) => `/data/nginx/proxy_host/${id}.conf`;

const real = {};
const FS_METHODS = ["readFileSync", "writeFileSync", "existsSync", "renameSync", "rmSync", "unlinkSync", "readdirSync"];
const redirect = (path) => (typeof path === "string" && path.startsWith("/data/nginx/") ? join(root, path) : path);

const unknownVariable = (name) =>
	new Error(`nginx: [emerg] unknown "${name}" variable\nnginx: configuration file /etc/nginx/nginx.conf test failed`);

// nginx -t over the managed files: `$missing_*` outside a comment is an unknown variable; `uses_shared` in one
// file only fails together with `breaks_shared` in another file
let tests = 0;
const fakeNginxTest = async () => {
	tests++;
	const texts = real
		.readdirSync(dir)
		.filter((f) => /^\d+\.conf$/.test(f))
		.map((f) =>
			real
				.readFileSync(join(dir, f), "utf8")
				.split("\n")
				.filter((line) => !line.trim().startsWith("#"))
				.join("\n"),
		);
	for (const text of texts) {
		const m = text.match(/\$(missing_[a-z_]+)/);
		if (m) {
			throw unknownVariable(m[1]);
		}
	}
	if (texts.some((t) => t.includes("uses_shared")) && texts.some((t) => t.includes("breaks_shared"))) {
		throw unknownVariable("shared_x");
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
const onDisk = (id) => (fs.existsSync(conf(id)) ? fs.readFileSync(conf(id), "utf8") : null);
const configure = async (id) => internalNginx.configure(proxyHostModel, "proxy_host", await row(id), { reload: false });

describe("an error without a line that the host's own config causes", () => {
	afterEach(async () => {
		for (const name of real.readdirSync(dir)) {
			real.rmSync(join(dir, name));
		}
		await db("proxy_host").delete();
	});

	it("names the advanced configuration, not a conflict with another host", async () => {
		const other = await host("", "server {\n  # ok\n}\n");
		const id = await host("add_header X-Test $missing_own_x;");
		tests = 0;
		await assert.rejects(configure(id), (err) => {
			assert.equal(err.details.scope, "host");
			assert.match(err.message, /^Advanced configuration: unknown variable "\$missing_own_x"/);
			assert.doesNotMatch(err.message, /another host/);
			assert.match(err.details.hint, /define it with set or map/);
			return true;
		});
		// the change is not applied, the other host is untouched
		assert.equal(onDisk(id), null);
		assert.match(onDisk(other), /# ok/);
		// failed, without this host, with every other host aside
		assert.equal(tests, 3);
	});

	it("names the advanced configuration on an update as well, and keeps the old config", async () => {
		await host("", "server {\n  # ok\n}\n");
		const id = await host("add_header X-Test $missing_own_x;", "server {\n  # before\n}\n");
		await assert.rejects(configure(id), (err) => {
			assert.match(err.message, /^Advanced configuration: unknown variable "\$missing_own_x"/);
			return true;
		});
		assert.match(onDisk(id), /# before/);
	});

	it("still reports a conflict when the error goes away with the other hosts moved aside", async () => {
		await host("", "server {\n  breaks_shared;\n}\n");
		const id = await host("uses_shared;");
		await assert.rejects(configure(id), (err) => {
			assert.match(err.message, /conflicts with the configuration of another host/);
			assert.doesNotMatch(err.message, /^Advanced configuration/);
			return true;
		});
		assert.equal(onDisk(id), null);
	});
});
