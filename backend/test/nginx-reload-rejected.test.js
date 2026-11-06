// The real configure() of a stream when `nginx -t` passes but the nginx master rejects the reload, eg. because
// another process listens on the stream's port (-t doesn't bind ports). The managed config files live in a
// temporary directory (fs calls for /data/nginx/ are redirected there).
import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { db, load, ts } from "./support/backend.js";

const errs = await load("lib/error.js");
const internalNginx = await load("internal/nginx.js");
const streamModel = await load("models/stream.js");

const root = fs.mkdtempSync(join(tmpdir(), "npm-reload-rejected-"));
const dir = join(root, "data/nginx/stream");
const conf = (id) => `/data/nginx/stream/${id}.conf`;

const real = {};
const FS_METHODS = ["readFileSync", "writeFileSync", "existsSync", "renameSync", "rmSync", "unlinkSync", "readdirSync"];
const redirect = (path) => (typeof path === "string" && path.startsWith("/data/nginx/") ? join(root, path) : path);

const BUSY = "bind() to 0.0.0.0:3333 failed (98: Address already in use)";
const rejected = (emerg = BUSY) => ({
	confirmed: false,
	rejected: true,
	emerg,
	reason: `nginx could not apply the config: ${emerg}`,
	waitedMs: 1,
});
const confirmed = () => ({ confirmed: true, waitedMs: 1 });

// the outcomes of the next reloads; each reload records the stream config nginx was asked to load
let outcomes = [];
let reloads = [];

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
	real.reloadWaiter = internalNginx.reloadWaiter;
	internalNginx.test = async () => {};
	internalNginx.generateConfig = async (_hostType, host) => {
		const text = `server {\n  listen ${host.incoming_port};\n}\n`;
		fs.writeFileSync(conf(host.id), text);
		return text;
	};
	internalNginx.reloadWaiter = {
		reloadAndWait: async () => {
			reloads.push(fs.readdirSync(dir).map((f) => fs.readFileSync(join(dir, f), "utf8")).join(""));
			return outcomes.length ? outcomes.shift() : confirmed();
		},
	};
});

after(async () => {
	for (const method of FS_METHODS) {
		fs[method] = real[method];
	}
	internalNginx.test = real.test;
	internalNginx.generateConfig = real.generateConfig;
	internalNginx.reloadWaiter = real.reloadWaiter;
	fs.rmSync(root, { recursive: true, force: true });
	await db.destroy();
});

const ONLINE = { nginx_online: true, nginx_err: null, nginx_checked_at: "2026-01-01T00:00:00.000Z" };
let nextId = 1;
const stream = async (port, file) => {
	const id = nextId++;
	await db("stream").insert({
		id,
		owner_user_id: 1,
		incoming_port: port,
		forwarding_host: "app",
		forwarding_port: 22,
		tcp_forwarding: 1,
		udp_forwarding: 0,
		meta: JSON.stringify(ONLINE),
		...ts,
	});
	if (file) {
		fs.writeFileSync(conf(id), `server {\n  listen ${port};\n}\n`);
	}
	return id;
};
const row = (id) => streamModel.query().where("id", id).first();
const onDisk = (id) => (fs.existsSync(conf(id)) ? fs.readFileSync(conf(id), "utf8") : null);
// the row with a new port, as an update hands it to configure()
const proposed = async (id, port) => Object.assign(await row(id), { incoming_port: port });

describe("a reload that nginx rejects", () => {
	beforeEach(() => {
		outcomes = [];
		reloads = [];
	});
	afterEach(async () => {
		for (const name of real.readdirSync(dir)) {
			real.rmSync(join(dir, name));
		}
		await db("stream").delete();
	});

	it("fails the save, reloads the previous config and keeps the status nginx runs", async () => {
		const id = await stream(2222, true);
		outcomes = [rejected(), confirmed()];
		await assert.rejects(internalNginx.configure(streamModel, "stream", await proposed(id, 3333)), (err) => {
			assert.ok(err instanceof errs.NginxConfigError);
			assert.equal(err.details.scope, "host");
			assert.equal(err.message, "The address 0.0.0.0:3333 is already in use.");
			assert.match(err.details.hint, /already listens on this port/);
			assert.match(err.details.nginx_output, /Address already in use/);
			// the caller rolls the row back, see internalHost.updateAndConfigure()
			assert.equal(internalNginx.isHostLevelError(err), true);
			return true;
		});
		// the rejected config, then the previous one again: nginx runs what is on disk
		assert.equal(reloads.length, 2);
		assert.match(reloads[0], /listen 3333/);
		assert.match(reloads[1], /listen 2222/);
		assert.match(onDisk(id), /listen 2222/);
		assert.deepEqual((await row(id)).meta, ONLINE);
	});

	it("removes the config of a new stream that nginx rejects", async () => {
		const id = await stream(3333, false);
		outcomes = [rejected(), confirmed()];
		await assert.rejects(internalNginx.configure(streamModel, "stream", await row(id)), errs.NginxConfigError);
		assert.equal(onDisk(id), null);
		assert.equal(reloads.length, 2);
		assert.doesNotMatch(reloads[1], /listen 3333/);
	});

	it("fails with a global error when nginx rejects the previous config as well", async () => {
		const id = await stream(2222, true);
		const other = "bind() to 0.0.0.0:4444 failed (98: Address already in use)";
		outcomes = [rejected(), rejected(other)];
		await assert.rejects(internalNginx.configure(streamModel, "stream", await proposed(id, 3333)), (err) => {
			assert.equal(err.details.scope, "global");
			assert.match(err.message, /the address 0\.0\.0\.0:4444 is already in use/);
			assert.equal(internalNginx.isHostLevelError(err), true);
			return true;
		});
		assert.equal(reloads.length, 2);
		assert.match(onDisk(id), /listen 2222/);
		assert.deepEqual((await row(id)).meta, ONLINE);
	});

	it("keeps a normal save at one reload", async () => {
		const id = await stream(2222, true);
		const meta = await internalNginx.configure(streamModel, "stream", await proposed(id, 3333));
		assert.equal(meta.nginx_online, true);
		assert.equal(reloads.length, 1);
		assert.match(onDisk(id), /listen 3333/);
		assert.equal((await row(id)).meta.nginx_online, true);
		assert.notEqual((await row(id)).meta.nginx_checked_at, ONLINE.nginx_checked_at);
	});
});

describe("a regeneration whose reload nginx rejects", () => {
	beforeEach(() => {
		outcomes = [];
		reloads = [];
	});
	afterEach(async () => {
		for (const name of real.readdirSync(dir)) {
			real.rmSync(join(dir, name));
		}
		await db("stream").delete();
	});

	it("fails with the readable error and the summary of what was regenerated", async () => {
		const id = await stream(3333, false);
		outcomes = [rejected()];
		await assert.rejects(internalNginx.regenerateAll({ hostTypes: ["stream"], restoreAside: false }), (err) => {
			assert.ok(err instanceof errs.NginxConfigError);
			assert.equal(err.details.scope, "global");
			assert.equal(err.details.kind, "nginx_config");
			assert.match(err.message, /the address 0\.0\.0\.0:3333 is already in use/);
			assert.match(err.details.nginx_output, /Address already in use/);
			assert.equal(err.regenerateSummary.checked, 1);
			assert.equal(err.regenerateSummary.regenerated, 1);
			assert.deepEqual(err.regenerateSummary.failed, []);
			return true;
		});
		// one reload, no second one: the regenerated files stay on disk for the user to fix
		assert.equal(reloads.length, 1);
		assert.match(onDisk(id), /listen 3333/);
	});

	it("returns the summary when nginx applies the reload", async () => {
		await stream(3333, false);
		const summary = await internalNginx.regenerateAll({ hostTypes: ["stream"], restoreAside: false });
		assert.equal(summary.regenerated, 1);
		assert.equal(reloads.length, 1);
	});
});
