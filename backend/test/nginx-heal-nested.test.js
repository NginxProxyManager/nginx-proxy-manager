import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { db, load, ts } from "./support/backend.js";

const internalNginx = await load("internal/nginx.js");

const dir = fs.mkdtempSync(join(tmpdir(), "npm-heal-"));
const file = (id) => join(dir, `${id}.conf`);
const parsed = (id) => ({ file: file(id), line: 2, message: `unknown directive "tampered_${id}"` });

const original = {};
// configureHost() calls, as [host id, depth]
let regenerated = [];
// host id -> the hosts its (stubbed) regeneration finds broken, like nginx -t of the regenerated file would
let findsBroken = {};

before(() => {
	original.getConfigName = internalNginx.getConfigName;
	original.configureHost = internalNginx.configureHost;
	internalNginx.getConfigName = (_hostType, id) => file(id);
	// A regeneration writes a good file for the host; when it then finds other broken files, it repairs them
	// the way configureHost() does, passing the repair state on.
	internalNginx.configureHost = async (_model, hostType, host, opts) => {
		regenerated.push([host.id, opts.depth]);
		fs.writeFileSync(file(host.id), "# regenerated\n");
		const protect = [...opts.protect, file(host.id)];
		for (const other of findsBroken[host.id] || []) {
			// configureHost() never repairs a protected file, it reports a conflict instead
			if (protect.includes(file(other))) {
				continue;
			}
			await internalNginx.healOtherHost(
				{ host_type: hostType, host_id: other },
				parsed(other),
				opts.depth,
				protect,
				opts.repair,
			);
		}
		return {};
	};
});

after(async () => {
	internalNginx.getConfigName = original.getConfigName;
	internalNginx.configureHost = original.configureHost;
	fs.rmSync(dir, { recursive: true, force: true });
	await db.destroy();
});

let nextId = 100;
const brokenHost = async () => {
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
	});
	fs.writeFileSync(file(id), `server {\n  tampered_${id} on;\n}\n`);
	return id;
};
const isOffline = async (id) =>
	JSON.parse((await db("proxy_host").where("id", id).first()).meta).nginx_online === false;
const heal = (id, repair) =>
	internalNginx.healOtherHost({ host_type: "proxy_host", host_id: id }, parsed(id), 0, [file(1)], repair);

describe("healOtherHost repairs nested broken hosts", () => {
	beforeEach(() => {
		regenerated = [];
		findsBroken = {};
	});
	afterEach(() => {
		for (const name of fs.readdirSync(dir)) {
			fs.rmSync(join(dir, name));
		}
	});

	it("regenerates a host found broken while another host is regenerated, instead of disabling it", async () => {
		// Saving host 1 finds B broken; B's regenerated config passes, but its check finds C broken
		const b = await brokenHost();
		const c = await brokenHost();
		findsBroken[b] = [c];

		assert.equal(await heal(b), true);

		assert.deepEqual(regenerated, [
			[b, 1],
			[c, 2],
		]);
		assert.equal(fs.existsSync(`${file(c)}.err`), false, "C was not moved aside");
		assert.equal(fs.readFileSync(file(c), "utf8"), "# regenerated\n");
		assert.equal(await isOffline(b), false);
		assert.equal(await isOffline(c), false);
	});

	it("gives each host one regeneration per operation", async () => {
		const b = await brokenHost();
		const c = await brokenHost();
		// B's regeneration finds C, C's finds B's file broken again (it can't be fixed by regenerating)
		findsBroken[b] = [c];
		findsBroken[c] = [b];
		const repair = { tried: new Set(), budget: 10 };

		await heal(b, repair);

		// B is on the protect list when C's check finds it, so it is not touched there
		assert.deepEqual(
			regenerated.map(([id]) => id),
			[b, c],
		);
		assert.deepEqual([...repair.tried].sort(), [file(b), file(c)].sort());

		// The same operation finding C broken again disables it instead of regenerating it a second time
		fs.writeFileSync(file(c), "tampered again\n");
		regenerated = [];
		await heal(c, repair);
		assert.deepEqual(regenerated, []);
		assert.equal(fs.existsSync(`${file(c)}.err`), true);
		assert.equal(await isOffline(c), true);
	});

	it("bounds the work of one operation by the shared repair budget", async () => {
		// A chain of 14 broken hosts, each found by the previous one's regeneration
		const chain = [];
		for (let i = 0; i < 14; i++) {
			chain.push(await brokenHost());
		}
		for (let i = 0; i < chain.length - 1; i++) {
			findsBroken[chain[i]] = [chain[i + 1]];
		}

		await heal(chain[0]);

		// MAX_HEAL_ITERATIONS (10) regenerations, the next host is moved aside and marked offline
		assert.deepEqual(
			regenerated.map(([id]) => id),
			chain.slice(0, 10),
		);
		assert.equal(fs.existsSync(`${file(chain[10])}.err`), true);
		assert.equal(await isOffline(chain[10]), true);
	});
});
