// configureDefaultSite(): the default site config is removed again and nginx reloaded whenever it can't be
// applied. The config files live in a temporary directory (fs calls for /data/nginx/ are redirected there).
import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { db, load } from "./support/backend.js";

const errs = await load("lib/error.js");
const internalNginx = await load("internal/nginx.js");

const root = fs.mkdtempSync(join(tmpdir(), "npm-default-site-"));
const SITE = "/data/nginx/default_host/site.conf";
const real = {};
const FS_METHODS = ["readFileSync", "writeFileSync", "existsSync", "renameSync", "rmSync", "unlinkSync", "readdirSync"];
const redirect = (path) => (typeof path === "string" && path.startsWith("/data/nginx/") ? join(root, path) : path);
const onDisk = (path) => (fs.existsSync(path) ? fs.readFileSync(path, "utf8") : null);

// the reloads, with the default site config nginx was asked to load
let reloads = [];
let outcomes = [];

before(() => {
	fs.mkdirSync(join(root, "data/nginx/default_host"), { recursive: true });
	fs.mkdirSync(join(root, "data/nginx/proxy_host"), { recursive: true });
	for (const method of FS_METHODS) {
		real[method] = fs[method];
		fs[method] =
			method === "renameSync"
				? (from, to) => real.renameSync(redirect(from), redirect(to))
				: (path, ...args) => real[method](redirect(path), ...args);
	}
	real.generateConfig = internalNginx.generateConfig;
	real.reloadNginx = internalNginx.reloadNginx;
	internalNginx.reloadNginx = async () => {
		reloads.push(onDisk(SITE));
		const next = outcomes.shift() || { confirmed: true };
		if (next instanceof Error) {
			throw next;
		}
		return next;
	};
});

after(async () => {
	for (const method of FS_METHODS) {
		fs[method] = real[method];
	}
	internalNginx.generateConfig = real.generateConfig;
	internalNginx.reloadNginx = real.reloadNginx;
	fs.rmSync(root, { recursive: true, force: true });
	await db.destroy();
});

describe("configuring the default site", () => {
	beforeEach(() => {
		reloads = [];
		outcomes = [];
		fs.writeFileSync(SITE, "# the previous default site\n");
	});
	afterEach(() => {
		internalNginx.generateConfig = real.generateConfig;
	});

	it("removes a config that fails while it is written and reloads nginx without it", async () => {
		internalNginx.generateConfig = async () => {
			fs.writeFileSync(SITE, "server {\n  listen 80 default;\n  location / {\n");
			throw new Error("ENOSPC: no space left on device, write");
		};
		await assert.rejects(
			internalNginx.configureDefaultSite({ id: "default-site", value: "congratulations" }),
			(err) => {
				assert.ok(err instanceof errs.ValidationError);
				assert.equal(err.message, "Could not reconfigure Nginx. Please check logs.");
				return true;
			},
		);
		// the cleanup reload: nginx falls back to the built-in default site, the partial file is gone
		assert.deepEqual(reloads, [null]);
		assert.equal(onDisk(SITE), null);
	});

	const rejected = (emerg) => ({ rejected: true, emerg, reason: `nginx could not apply the config: ${emerg}` });
	const writeNew = () => {
		internalNginx.generateConfig = async () => {
			fs.writeFileSync(SITE, "# new default site\n");
			return "# new default site\n";
		};
	};

	it("keeps the new config when nginx rejects the reload for another file, and says it doesn't run it yet", async () => {
		writeNew();
		outcomes = [rejected("bind() to 0.0.0.0:3333 failed (98: Address already in use)")];
		await assert.rejects(internalNginx.configureDefaultSite({ id: "default-site", value: "404" }), (err) => {
			assert.ok(err instanceof errs.NginxConfigError);
			assert.equal(err.details.scope, "global");
			assert.equal(err.details.context, "default_site");
			assert.match(err.message, /0\.0\.0\.0:3333 is already in use/);
			assert.match(err.message, /applies with the next reload nginx accepts/);
			return true;
		});
		// no cleanup: the new default site is not the cause
		assert.equal(reloads.length, 1);
		assert.equal(onDisk(SITE), "# new default site\n");
	});

	it("removes the new config when nginx rejects the reload naming it", async () => {
		writeNew();
		outcomes = [rejected(`invalid number of arguments in "return" directive in ${SITE}:3`)];
		await assert.rejects(internalNginx.configureDefaultSite({ id: "default-site", value: "404" }), (err) => {
			assert.ok(err instanceof errs.NginxConfigError);
			assert.equal(err.details.context, "default_site");
			assert.match(err.message, /^Could not reconfigure the default site/);
			return true;
		});
		assert.deepEqual(reloads, ["# new default site\n", null]);
		assert.equal(onDisk(SITE), null);
	});

	it("applies a config that renders and that nginx accepts with one reload", async () => {
		internalNginx.generateConfig = async () => {
			fs.writeFileSync(SITE, "# new default site\n");
			return "# new default site\n";
		};
		await internalNginx.configureDefaultSite({ id: "default-site", value: "404" });
		assert.deepEqual(reloads, ["# new default site\n"]);
		assert.equal(onDisk(SITE), "# new default site\n");
	});
});
