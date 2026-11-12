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
// the retries scheduled for hosts nginx rejected a reload without, see scheduleRetry()
let retries = [];

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
	real.scheduleRetry = internalNginx.scheduleRetry;
	internalNginx.scheduleRetry = (only, attempt = 1) => {
		retries.push({ only, attempt });
	};
	internalNginx.test = async () => {};
	internalNginx.generateConfig = async (_hostType, host) => {
		const text = `server {\n  listen ${host.incoming_port};\n}\n`;
		fs.writeFileSync(conf(host.id), text);
		return text;
	};
	internalNginx.reloadWaiter = {
		reloadAndWait: async () => {
			// nginx includes the *.conf files only
			reloads.push(
				fs
					.readdirSync(dir)
					.filter((f) => f.endsWith(".conf"))
					.sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10))
					.map((f) => fs.readFileSync(join(dir, f), "utf8"))
					.join(""),
			);
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
	internalNginx.scheduleRetry = real.scheduleRetry;
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
		retries = [];
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

describe("a reload that nginx rejects after configs were written without reloading", () => {
	beforeEach(() => {
		outcomes = [];
		reloads = [];
		retries = [];
	});
	afterEach(async () => {
		for (const name of real.readdirSync(dir)) {
			real.rmSync(join(dir, name));
		}
		await db("stream").delete();
	});
	const errFile = (id) => (fs.existsSync(`${conf(id)}.err`) ? fs.readFileSync(`${conf(id)}.err`, "utf8") : null);

	it("startup reconcile takes the stream offline whose config nginx rejects and applies the others", async () => {
		const ok = await stream(2222, false);
		const busy = await stream(3333, false);
		// all regenerated configs, then without the one that listens on the address nginx could not bind
		outcomes = [rejected(), confirmed()];
		const summary = await internalNginx.reconcile();
		assert.equal(summary.regenerated, 1);
		assert.equal(summary.offline, 1);
		assert.deepEqual(summary.retry, {});
		assert.equal(reloads.length, 2);
		assert.match(reloads[0], /listen 2222[\s\S]*listen 3333/);
		assert.match(reloads[1], /listen 2222/);
		assert.doesNotMatch(reloads[1], /listen 3333/);

		assert.match(onDisk(ok), /listen 2222/);
		assert.equal((await row(ok)).meta.nginx_online, true);
		// nginx doesn't run it: offline with the reason, and the next reconcile regenerates it (.err)
		assert.equal(onDisk(busy), null);
		assert.match(errFile(busy), /listen 3333/);
		const meta = (await row(busy)).meta;
		assert.equal(meta.nginx_online, false);
		assert.equal(meta.nginx_err, "The address 0.0.0.0:3333 is already in use.");
		assert.equal(meta.nginx_details.scope, "host");
		assert.match(meta.nginx_details.nginx_output, /Address already in use/);

		// later reloads apply again: the rejected file is no longer included
		outcomes = [confirmed()];
		await internalNginx.reload();
		assert.doesNotMatch(reloads[2], /listen 3333/);
	});

	it("startup reconcile marks the regenerated streams offline and tries them again when nginx rejects the reload without them as well", async () => {
		const id = await stream(2222, false);
		outcomes = [rejected(), rejected("bind() to 0.0.0.0:4444 failed (98: Address already in use)")];
		const summary = await internalNginx.reconcile();
		assert.equal(summary.regenerated, 0);
		assert.equal(summary.offline, 1);
		assert.deepEqual(summary.retry, { stream: [id] });
		assert.deepEqual(retries, [{ only: { stream: [id] }, attempt: 1 }]);
		assert.equal(reloads.length, 2);
		assert.equal(onDisk(id), null);
		assert.match(errFile(id), /listen 2222/);
		const meta = (await row(id)).meta;
		assert.equal(meta.nginx_online, false);
		assert.equal(meta.nginx_details.scope, "global");
		assert.match(meta.nginx_err, /0\.0\.0\.0:4444 is already in use/);
	});

	// nginx rejects every reload that includes a busy port, with the message of `emerg(port)`
	const rejectBusy = async (ports, emerg, fn) => {
		const fakeReload = internalNginx.reloadWaiter.reloadAndWait;
		internalNginx.reloadWaiter.reloadAndWait = async () => {
			const text = fs
				.readdirSync(dir)
				.filter((f) => f.endsWith(".conf"))
				.sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10))
				.map((f) => fs.readFileSync(join(dir, f), "utf8"))
				.join("");
			reloads.push(text);
			const port = ports.find((p) => new RegExp(`listen (\\S+:)?${p}[ ;]`).test(text.replace(/#.*/g, "")));
			return port ? rejected(emerg(port)) : confirmed();
		};
		try {
			return await fn();
		} finally {
			internalNginx.reloadWaiter.reloadAndWait = fakeReload;
		}
	};
	const busyPort = (port) => `bind() to 0.0.0.0:${port} failed (98: Address already in use)`;

	it("startup reconcile sets aside the configs of each address nginx could not bind, one after the other", async () => {
		const ids = [];
		for (let i = 0; i < 8; i++) {
			ids.push(await stream(5000 + i, false));
		}
		const busy = [ids[2], ids[7]];
		const summary = await rejectBusy([5002, 5007], busyPort, () => internalNginx.reconcile());
		assert.equal(summary.regenerated, 6);
		assert.equal(summary.offline, 2);
		// all, without 5002, without 5002 and 5007
		assert.equal(reloads.length, 3);
		for (const id of ids) {
			const offline = busy.includes(id);
			assert.equal(onDisk(id) === null, offline);
			assert.equal((await row(id)).meta.nginx_online, !offline);
		}
		assert.equal((await row(ids[2])).meta.nginx_err, "The address 0.0.0.0:5002 is already in use.");
		assert.equal((await row(ids[7])).meta.nginx_err, "The address 0.0.0.0:5007 is already in use.");
	});

	it("startup reconcile sets aside the configs of every address nginx could not bind at once", async () => {
		const a = await stream(5000, false);
		const b = await stream(5001, false);
		const c = await stream(5002, false);
		outcomes = [{ ...rejected(busyPort(5000)), bindErrors: [busyPort(5000), busyPort(5002)] }, confirmed()];
		const summary = await internalNginx.reconcile();
		assert.equal(summary.offline, 2);
		assert.equal(reloads.length, 2);
		assert.equal((await row(a)).meta.nginx_online, false);
		assert.equal((await row(b)).meta.nginx_online, true);
		// each host gets the message of its own address
		assert.equal((await row(c)).meta.nginx_err, "The address 0.0.0.0:5002 is already in use.");
	});

	it("startup reconcile finds the rejected configs among many in a few reloads when nginx names no address", async () => {
		const ids = [];
		for (let i = 0; i < 8; i++) {
			ids.push(await stream(5000 + i, false));
		}
		const busy = [ids[2], ids[7]];
		const summary = await rejectBusy(
			[5002, 5007],
			() => "could not apply the config",
			() => internalNginx.reconcile(),
		);
		assert.equal(summary.regenerated, 6);
		assert.equal(summary.offline, 2);
		// all, none, then halves: [0-3] [0-1] [2-3] [2] [3] [4-7] [4-5] [6-7] [6] [7]
		assert.equal(reloads.length, 12);
		for (const id of ids) {
			const offline = busy.includes(id);
			assert.equal(onDisk(id) === null, offline);
			assert.equal((await row(id)).meta.nginx_online, !offline);
		}
	});

	it("startup reconcile keeps one reload when nginx applies it", async () => {
		const id = await stream(2222, false);
		const summary = await internalNginx.reconcile();
		assert.equal(summary.regenerated, 1);
		assert.equal(reloads.length, 1);
		assert.equal((await row(id)).meta.nginx_online, true);
	});

	it("taking a host with an unsafe value offline takes the repaired host offline whose config nginx rejects", async () => {
		const unsafe = await stream(2222, true);
		const repaired = await stream(3333, true);
		const err = Object.assign(new Error("Forward Hostname / IP: unsafe value"), {
			unsafeNginxValue: { field: "forwarding_host", value: "x;" },
		});
		// with the unsafe host's config removed, then without the repaired one that listens on the busy address
		outcomes = [rejected(), confirmed()];
		const meta = await internalNginx.takeUnsafeHostOffline(
			streamModel,
			"stream",
			await row(unsafe),
			conf(unsafe),
			err,
			{
				reload: true,
				repaired: [conf(repaired)],
			},
		);
		assert.equal(meta.nginx_online, false);
		assert.equal(onDisk(unsafe), null);
		assert.equal(reloads.length, 2);
		assert.doesNotMatch(reloads[1], /listen/);
		// nginx runs the files on disk: neither stream
		assert.equal(onDisk(repaired), null);
		assert.match(errFile(repaired), /listen 3333/);
		const repairedMeta = (await row(repaired)).meta;
		assert.equal(repairedMeta.nginx_online, false);
		assert.equal(repairedMeta.nginx_err, "The address 0.0.0.0:3333 is already in use.");
	});

	it("puts the repaired configs back when nginx rejects the reload without them as well", async () => {
		const unsafe = await stream(2222, true);
		const repaired = await stream(3333, true);
		const err = Object.assign(new Error("unsafe"), { unsafeNginxValue: { field: "forwarding_host", value: "x;" } });
		outcomes = [rejected(), rejected()];
		await internalNginx.takeUnsafeHostOffline(streamModel, "stream", await row(unsafe), conf(unsafe), err, {
			reload: true,
			repaired: [conf(repaired)],
		});
		assert.equal(reloads.length, 2);
		assert.match(onDisk(repaired), /listen 3333/);
		assert.equal(errFile(repaired), null);
		assert.deepEqual((await row(repaired)).meta, ONLINE);
	});
	it("never applies a reload without the repaired configs that nginx accepts, while it serves them", async () => {
		const unsafe = await stream(2222, true);
		const healthy = [await stream(4000, true), await stream(4001, true), await stream(4002, true)];
		const busy = await stream(3333, true);
		const err = Object.assign(new Error("unsafe"), { unsafeNginxValue: { field: "forwarding_host", value: "x;" } });
		const applied = [];
		await rejectBusy([3333], busyPort, async () => {
			const fake = internalNginx.reloadWaiter.reloadAndWait;
			internalNginx.reloadWaiter.reloadAndWait = async () => {
				const outcome = await fake();
				if (!outcome.rejected) {
					applied.push(reloads[reloads.length - 1]);
				}
				return outcome;
			};
			try {
				await internalNginx.takeUnsafeHostOffline(streamModel, "stream", await row(unsafe), conf(unsafe), err, {
					reload: true,
					repaired: [...healthy, busy].map(conf),
				});
			} finally {
				internalNginx.reloadWaiter.reloadAndWait = fake;
			}
		});
		assert.equal(reloads.length, 2);
		assert.equal(applied.length, 1);
		// the served configs are never set aside, not even for a reload nginx rejects
		for (const text of reloads) {
			for (let i = 0; i < healthy.length; i++) {
				assert.match(text, new RegExp(`listen ${4000 + i};`));
			}
		}
		for (const id of healthy) {
			assert.match(applied[0], new RegExp(`listen ${4000 + healthy.indexOf(id)};`));
			assert.equal((await row(id)).meta.nginx_online, true);
		}
		assert.equal((await row(busy)).meta.nginx_online, false);
		assert.match(errFile(busy), /listen 3333/);
	});

	it("leaves the repaired configs nginx serves in place when it names no address", async () => {
		const unsafe = await stream(2222, true);
		const repaired = [await stream(4000, true), await stream(3333, true)];
		const err = Object.assign(new Error("unsafe"), { unsafeNginxValue: { field: "forwarding_host", value: "x;" } });
		outcomes = [rejected("could not apply the config")];
		await internalNginx.takeUnsafeHostOffline(streamModel, "stream", await row(unsafe), conf(unsafe), err, {
			reload: true,
			repaired: repaired.map(conf),
		});
		// no reload that could apply without them: nginx keeps running its previous config
		assert.equal(reloads.length, 1);
		for (const id of repaired) {
			assert.notEqual(onDisk(id), null);
			assert.deepEqual((await row(id)).meta, ONLINE);
		}
	});

	it("sets aside only the repaired config whose file nginx names, while it serves the others", async () => {
		const unsafe = await stream(2222, true);
		const healthy = [await stream(4000, true), await stream(4001, true), await stream(4002, true)];
		const broken = await stream(4003, true);
		const err = Object.assign(new Error("unsafe"), { unsafeNginxValue: { field: "forwarding_host", value: "x;" } });
		const emerg = `unknown directive "x" in ${conf(broken)}:2`;
		outcomes = [rejected(emerg), confirmed()];
		await internalNginx.takeUnsafeHostOffline(streamModel, "stream", await row(unsafe), conf(unsafe), err, {
			reload: true,
			repaired: [...healthy, broken].map(conf),
		});
		assert.equal(reloads.length, 2);
		// no reload without the served configs, not even one nginx rejects
		for (const text of reloads) {
			for (let i = 0; i < healthy.length; i++) {
				assert.match(text, new RegExp(`listen ${4000 + i};`));
			}
		}
		assert.doesNotMatch(reloads[1], /listen 4003;/);
		for (const id of healthy) {
			assert.deepEqual((await row(id)).meta, ONLINE);
		}
		const meta = (await row(broken)).meta;
		assert.equal(meta.nginx_online, false);
		assert.match(errFile(broken), /listen 4003/);
	});

	it("matches the listen addresses of a config with the addresses nginx could not bind", async () => {
		const id = await stream(3333, false);
		const other = await stream(4444, false);
		const fakeGenerate = internalNginx.generateConfig;
		internalNginx.generateConfig = async (_hostType, host) => {
			const text =
				host.id === id
					? "server {\n  listen 3333 reuseport;\n  listen [::]:3333 reuseport;\n}\n"
					: "server {\n  #listen [::]:3333;\n  listen 127.0.0.1:4444 udp;\n}\n";
			fs.writeFileSync(conf(host.id), text);
			return text;
		};
		outcomes = [rejected("bind() to [::]:3333 failed (98: Address already in use)"), confirmed()];
		try {
			await internalNginx.reconcile();
		} finally {
			internalNginx.generateConfig = fakeGenerate;
		}
		assert.equal(reloads.length, 2);
		assert.equal((await row(id)).meta.nginx_online, false);
		assert.equal((await row(other)).meta.nginx_online, true);
		assert.match(reloads[1], /127\.0\.0\.1:4444/);
	});

	it("resolves the host names a config listens on to match them with the addresses nginx could not bind", async () => {
		const id = await stream(3341, false);
		const fakeGenerate = internalNginx.generateConfig;
		internalNginx.generateConfig = async (_hostType, host) => {
			const text = "server {\n  listen localhost:3341;\n}\n";
			fs.writeFileSync(conf(host.id), text);
			return text;
		};
		outcomes = [rejected("bind() to 127.0.0.1:3341 failed (98: Address already in use)"), confirmed()];
		try {
			await internalNginx.reconcile();
		} finally {
			internalNginx.generateConfig = fakeGenerate;
		}
		// named by its address: set aside right away, no bisection
		assert.equal(reloads.length, 2);
		assert.equal((await row(id)).meta.nginx_online, false);
		assert.equal((await row(id)).meta.nginx_details.scope, "host");
	});

	it("startup reconcile never sets aside the configs nginx serves while it looks for the rejected one", async () => {
		// on disk, so nginx serves them, and regenerated (eg. a retry pass, or written for an older version)
		const served = [await stream(4000, true), await stream(4001, true), await stream(4002, true)];
		const busy = await stream(3333, false);
		const summary = await rejectBusy(
			[3333],
			() => "could not apply the config",
			() => internalNginx.reconcile({ only: { stream: [...served, busy] } }),
		);
		// all, without the new one, the new one again
		assert.equal(reloads.length, 3);
		for (const text of reloads) {
			for (let i = 0; i < served.length; i++) {
				assert.match(text, new RegExp(`listen ${4000 + i};`));
			}
		}
		assert.equal(summary.regenerated, 3);
		assert.equal(summary.offline, 1);
		for (const id of served) {
			assert.equal((await row(id)).meta.nginx_online, true);
		}
		assert.equal((await row(busy)).meta.nginx_online, false);
		assert.match(errFile(busy), /listen 3333/);
	});

	it("startup reconcile leaves the configs nginx serves in place and online when it rejects the reload for another reason", async () => {
		const served = [await stream(4000, true), await stream(4001, true)];
		const fresh = await stream(4002, false);
		const other = "bind() to 0.0.0.0:3340 failed (98: Address already in use)";
		outcomes = [rejected(other), rejected(other)];
		const summary = await internalNginx.reconcile({ only: { stream: [...served, fresh] } });
		// all, then without the new one
		assert.equal(reloads.length, 2);
		for (const text of reloads) {
			assert.match(text, /listen 4000;[\s\S]*listen 4001;/);
		}
		for (const id of served) {
			assert.match(onDisk(id), new RegExp(`listen ${4000 + served.indexOf(id)};`));
			assert.equal(errFile(id), null);
			assert.equal((await row(id)).meta.nginx_online, true);
		}
		// nginx doesn't run the new one: offline and tried again
		assert.equal(onDisk(fresh), null);
		assert.equal((await row(fresh)).meta.nginx_details.scope, "global");
		assert.deepEqual(summary.retry, { stream: [fresh] });
	});

	it("startup reconcile reloads once when nginx rejects the reload for another reason and serves all regenerated configs", async () => {
		const served = [await stream(4000, true), await stream(4001, true)];
		outcomes = [rejected("bind() to 0.0.0.0:3340 failed (98: Address already in use)")];
		const summary = await internalNginx.reconcile({ only: { stream: served } });
		assert.equal(reloads.length, 1);
		assert.equal(summary.offline, 0);
		assert.deepEqual(summary.retry, {});
		for (const id of served) {
			assert.notEqual(onDisk(id), null);
			assert.equal((await row(id)).meta.nginx_online, true);
		}
	});

	const unsafeErr = () =>
		Object.assign(new Error("Forward Hostname / IP: unsafe value"), {
			unsafeNginxValue: { field: "forwarding_host", value: "x;" },
		});
	const GLOBAL = "bind() to 0.0.0.0:3340 failed (98: Address already in use)";

	it("applying repairs takes the repaired hosts offline whose new configs nginx doesn't run when it rejects the reload for another reason", async () => {
		const served = await stream(4000, true);
		// regenerated by this operation, its file was not on disk before
		const fresh = await stream(4001, true);
		// with all repaired configs, then without the new one
		outcomes = [rejected(GLOBAL), rejected(GLOBAL)];
		await internalNginx.applyRepairs("stream", { id: 99 }, [conf(served), conf(fresh)], [conf(fresh)]);
		assert.equal(reloads.length, 2);
		assert.match(reloads[1], /listen 4000;/);
		assert.doesNotMatch(reloads[1], /listen 4001;/);
		// the served one stays as it is: nginx keeps running it
		assert.match(onDisk(served), /listen 4000/);
		assert.deepEqual((await row(served)).meta, ONLINE);
		// the new one is not shown online for a config nginx never loaded, and is tried again
		assert.equal(onDisk(fresh), null);
		assert.match(errFile(fresh), /listen 4001/);
		const meta = (await row(fresh)).meta;
		assert.equal(meta.nginx_online, false);
		assert.equal(meta.nginx_details.scope, "global");
		assert.match(meta.nginx_err, /0\.0\.0\.0:3340 is already in use/);
		assert.deepEqual(retries, [{ only: { stream: [fresh] }, attempt: 1 }]);
	});

	it("applying repairs bisects the repaired configs nginx doesn't run when it names no address", async () => {
		const served = await stream(4000, true);
		const fresh = [await stream(4001, true), await stream(3333, true)];
		await rejectBusy(
			[3333],
			() => "could not apply the config",
			() => internalNginx.applyRepairs("stream", { id: 99 }, [served, ...fresh].map(conf), fresh.map(conf)),
		);
		// all, without the new ones, [4001], [3333]
		assert.equal(reloads.length, 4);
		for (const text of reloads) {
			assert.match(text, /listen 4000;/);
		}
		assert.equal((await row(fresh[0])).meta.nginx_online, true);
		assert.match(onDisk(fresh[0]), /listen 4001/);
		assert.equal((await row(fresh[1])).meta.nginx_online, false);
		assert.equal((await row(fresh[1])).meta.nginx_details.scope, "host");
		assert.deepEqual(retries, []);
	});

	it("taking a host with an unsafe value offline takes the new repaired configs offline as well when nginx rejects the reload for another reason", async () => {
		const unsafe = await stream(2222, true);
		const served = await stream(4000, true);
		const fresh = await stream(4001, true);
		outcomes = [rejected(GLOBAL), rejected(GLOBAL)];
		const meta = await internalNginx.takeUnsafeHostOffline(
			streamModel,
			"stream",
			await row(unsafe),
			conf(unsafe),
			unsafeErr(),
			{ reload: true, repaired: [conf(served), conf(fresh)], unserved: [conf(fresh)] },
		);
		assert.equal(reloads.length, 2);
		assert.equal(onDisk(unsafe), null);
		// offline: its config is gone, but nginx still runs its previous one until a reload applies, and says so
		assert.equal(meta.nginx_online, false);
		assert.equal(meta.nginx_details.kind, "unsafe_value");
		assert.equal(meta.nginx_details.previous_config_running, true);
		assert.deepEqual((await row(unsafe)).meta, meta);
		assert.deepEqual((await row(served)).meta, ONLINE);
		assert.equal(onDisk(fresh), null);
		assert.equal((await row(fresh)).meta.nginx_details.scope, "global");
		assert.deepEqual(retries, [{ only: { stream: [fresh] }, attempt: 1 }]);
	});

	it("taking a host with an unsafe value offline doesn't claim nginx runs a previous config it never had", async () => {
		const unsafe = await stream(2222, false);
		outcomes = [rejected(GLOBAL)];
		const meta = await internalNginx.takeUnsafeHostOffline(
			streamModel,
			"stream",
			await row(unsafe),
			conf(unsafe),
			unsafeErr(),
			{ reload: true, repaired: [] },
		);
		assert.equal(meta.nginx_online, false);
		assert.equal(meta.nginx_details.previous_config_running, undefined);
	});

	it("taking a host with an unsafe value offline leaves out the previous config note when nginx applies the removal", async () => {
		const unsafe = await stream(2222, true);
		const meta = await internalNginx.takeUnsafeHostOffline(
			streamModel,
			"stream",
			await row(unsafe),
			conf(unsafe),
			unsafeErr(),
			{ reload: true, repaired: [] },
		);
		assert.equal(reloads.length, 1);
		assert.doesNotMatch(reloads[0], /listen 2222/);
		assert.equal(meta.nginx_online, false);
		assert.equal(meta.nginx_details.previous_config_running, undefined);
	});
});
