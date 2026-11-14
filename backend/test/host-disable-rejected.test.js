// Disabling a host while nginx rejects the reload (for another file: removing a config can't cause it): nginx
// still serves the host, so its config goes back and it stays enabled. The config files live in a temporary
// directory (fs calls for /data/nginx/ are redirected there).
import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, before, describe, it } from "node:test";
import { access, db, load, ts } from "./support/backend.js";

const errs = await load("lib/error.js");
const internalNginx = await load("internal/nginx.js");
const internalHost = await load("internal/host.js");
const internalStream = await load("internal/stream.js");
const internalAuditLog = await load("internal/audit-log.js");
const streamModel = await load("models/stream.js");

const root = fs.mkdtempSync(join(tmpdir(), "npm-disable-rejected-"));
const CONF = "/data/nginx/stream/1.conf";
const real = {};
const FS_METHODS = ["readFileSync", "writeFileSync", "existsSync", "renameSync", "rmSync", "unlinkSync", "readdirSync"];
const redirect = (path) => (typeof path === "string" && path.startsWith("/data/nginx/") ? join(root, path) : path);
const onDisk = (path) => (fs.existsSync(path) ? fs.readFileSync(path, "utf8") : null);

let outcome;
let reloads = 0;

before(() => {
	fs.mkdirSync(join(root, "data/nginx/stream"), { recursive: true });
	for (const method of FS_METHODS) {
		real[method] = fs[method];
		fs[method] =
			method === "renameSync"
				? (from, to) => real.renameSync(redirect(from), redirect(to))
				: (path, ...args) => real[method](redirect(path), ...args);
	}
	real.reloadNginx = internalNginx.reloadNginx;
	internalNginx.reloadNginx = async () => {
		reloads++;
		if (outcome instanceof Error) {
			throw outcome;
		}
		return outcome;
	};
});

after(async () => {
	for (const method of FS_METHODS) {
		fs[method] = real[method];
	}
	internalNginx.reloadNginx = real.reloadNginx;
	fs.rmSync(root, { recursive: true, force: true });
	await db.destroy();
});

describe("disabling a host", () => {
	afterEach(async () => {
		reloads = 0;
		await db("stream").delete();
	});
	const addStream = async () => {
		await db("stream").insert({
			id: 1,
			owner_user_id: 1,
			incoming_port: 2222,
			forwarding_host: "app",
			forwarding_port: 22,
			tcp_forwarding: 1,
			udp_forwarding: 0,
			enabled: 1,
			meta: "{}",
			...ts,
		});
		fs.writeFileSync(CONF, "server {\n  listen 2222;\n}\n");
	};
	const disable = () =>
		internalHost.setEnabledAndConfigure({
			model: streamModel,
			hostType: "stream",
			enable: false,
			fetch: () => streamModel.query().where("id", 1).first(),
			alreadyMessage: "Stream is already disabled",
		});

	it("keeps the host enabled with its config when nginx rejects the reload that removes it", async () => {
		await addStream();
		const emerg = 'unknown directive "x" in /data/nginx/stream/7.conf:2';
		outcome = { rejected: true, emerg, reason: `nginx could not apply the config: ${emerg}` };
		await assert.rejects(disable(), (err) => {
			assert.ok(err instanceof errs.NginxConfigError);
			assert.equal(err.details.scope, "global");
			assert.match(err.message, /Stream #7/);
			return true;
		});
		assert.equal(reloads, 1);
		assert.equal(!!(await streamModel.query().where("id", 1).first()).enabled, true);
		assert.equal(onDisk(CONF), "server {\n  listen 2222;\n}\n");
	});

	it("disables an offline host (only its .err file) when nginx rejects the reload for another file", async () => {
		await addStream();
		fs.renameSync(CONF, `${CONF}.err`);
		const emerg = 'unknown directive "x" in /data/nginx/stream/7.conf:2';
		outcome = { rejected: true, emerg, reason: `nginx could not apply the config: ${emerg}` };
		const row = await disable();
		assert.equal(reloads, 1);
		assert.equal(!!row.enabled, false);
		assert.equal(!!(await streamModel.query().where("id", 1).first()).enabled, false);
		assert.equal(onDisk(CONF), null);
		assert.equal(onDisk(`${CONF}.err`), "server {\n  listen 2222;\n}\n");
		fs.rmSync(`${CONF}.err`, { force: true });
	});

	it("keeps the host enabled with its config when the test fails and can't be healed", async () => {
		await addStream();
		outcome = new errs.NginxConfigError('unknown directive "x"', { kind: "nginx_config", scope: "global" });
		await assert.rejects(disable(), errs.NginxConfigError);
		assert.equal(!!(await streamModel.query().where("id", 1).first()).enabled, true);
		assert.equal(onDisk(CONF), "server {\n  listen 2222;\n}\n");
	});

	it("removes the config when nginx applies the reload", async () => {
		await addStream();
		outcome = { confirmed: true };
		const row = await disable();
		assert.equal(!!row.enabled, false);
		assert.equal(!!(await streamModel.query().where("id", 1).first()).enabled, false);
		assert.equal(onDisk(CONF), null);
	});
});

describe("deleting a host", () => {
	const audit = internalAuditLog.add;
	before(() => {
		internalAuditLog.add = async () => {};
	});
	after(() => {
		internalAuditLog.add = audit;
	});
	afterEach(async () => {
		await db("stream").delete();
	});
	const addStream = async () => {
		await db("stream").insert({
			id: 1,
			owner_user_id: 1,
			incoming_port: 2222,
			forwarding_host: "app",
			forwarding_port: 22,
			tcp_forwarding: 1,
			udp_forwarding: 0,
			enabled: 1,
			meta: "{}",
			...ts,
		});
		fs.writeFileSync(CONF, "server {\n  listen 2222;\n}\n");
	};
	const isDeleted = async () => !!(await streamModel.query().where("id", 1).first()).is_deleted;

	for (const [name, make] of [
		[
			"nginx rejects the reload",
			() => {
				const emerg = 'unknown directive "x" in /data/nginx/stream/7.conf:2';
				return { rejected: true, emerg, reason: `nginx could not apply the config: ${emerg}` };
			},
		],
		[
			"the test fails",
			() => new errs.NginxConfigError('unknown directive "x"', { kind: "nginx_config", scope: "global" }),
		],
	]) {
		it(`undoes the delete and keeps the config when ${name}`, async () => {
			await addStream();
			outcome = make();
			await assert.rejects(internalStream.delete(access, { id: 1 }), errs.NginxConfigError);
			assert.equal(await isDeleted(), false);
			assert.equal(onDisk(CONF), "server {\n  listen 2222;\n}\n");
		});
	}

	it("deletes the host when nginx applies the reload", async () => {
		await addStream();
		outcome = { confirmed: true };
		assert.equal(await internalStream.delete(access, { id: 1 }), true);
		assert.equal(await isDeleted(), true);
		assert.equal(onDisk(CONF), null);
	});
});
