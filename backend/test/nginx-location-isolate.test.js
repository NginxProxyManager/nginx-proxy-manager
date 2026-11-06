import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { isolateFaultyLocations } from "../lib/nginx-locations.js";
import { db, load, ts } from "./support/backend.js";

const internalNginx = await load("internal/nginx.js");
const proxyHostModel = await load("models/proxy_host.js");

describe("isolateFaultyLocations", () => {
	const parsed = { file: null, line: null, message: 'unknown "missing" variable' };
	const fail = (message = parsed.message) => ({ ok: false, parsed: { message } });
	// nginx -t fails while any of `bad` is rendered (not stubbed); with `together`, only while all of them are
	const tester = (bad, { together = false, other = null } = {}) => {
		const calls = [];
		const testWithStubs = async (stubbed) => {
			calls.push([...stubbed]);
			if (other) {
				return fail(other);
			}
			const rendered = bad.filter((i) => !stubbed.includes(i));
			const fails = together ? rendered.length === bad.length : rendered.length > 0;
			return fails ? fail() : { ok: true };
		};
		return { calls, testWithStubs };
	};

	it("finds the one location that causes the error", async () => {
		const t = tester([2]);
		assert.deepEqual(await isolateFaultyLocations({ candidates: [0, 1, 2, 3], parsed, ...t }), [2]);
		// all stubbed, then each one rendered alone
		assert.deepEqual(t.calls, [
			[0, 1, 2, 3],
			[1, 2, 3],
			[0, 2, 3],
			[0, 1, 3],
			[0, 1, 2],
		]);
	});

	it("returns null when the error stays with every location stubbed, eg. the host's advanced config", async () => {
		const t = tester([]);
		t.testWithStubs = async (stubbed) => {
			t.calls.push(stubbed);
			return fail();
		};
		assert.equal(await isolateFaultyLocations({ candidates: [0, 1], parsed, ...t }), null);
		assert.deepEqual(t.calls, [[0, 1]]);
	});

	it("finds every location that fails on its own with the same error, never a working one", async () => {
		// two broken locations report the same message: stubbing one alone leaves the other's error
		const t = tester([0, 2]);
		assert.deepEqual(await isolateFaultyLocations({ candidates: [0, 1, 2], parsed, ...t }), [0, 2]);
		assert.deepEqual(t.calls, [
			[0, 1, 2],
			[1, 2],
			[0, 2],
			[0, 1],
		]);
	});

	it("stubs one at a time when the locations only fail together", async () => {
		// eg. both define the same thing: none fails alone, stubbing the first one is enough
		assert.deepEqual(
			await isolateFaultyLocations({ candidates: [0, 1, 2], parsed, ...tester([0, 2], { together: true }) }),
			[0],
		);
	});

	it("returns all candidates when no single one is the cause", async () => {
		// fails while any two of them are rendered: none alone, and stubbing one still leaves two
		const testWithStubs = async (stubbed) =>
			[0, 1, 2].filter((i) => !stubbed.includes(i)).length >= 2 ? fail() : { ok: true };
		assert.deepEqual(await isolateFaultyLocations({ candidates: [0, 1, 2], parsed, testWithStubs }), [0, 1, 2]);
	});

	it("counts a different error as a change", async () => {
		assert.deepEqual(
			await isolateFaultyLocations({ candidates: [0, 1], parsed, ...tester([0], { other: "something else" }) }),
			[0],
		);
	});

	it("does nothing without candidates", async () => {
		const t = tester([0]);
		assert.equal(await isolateFaultyLocations({ candidates: [], parsed, ...t }), null);
		assert.deepEqual(t.calls, []);
	});

	it("needs no second test for a single candidate", async () => {
		const t = tester([0]);
		assert.deepEqual(await isolateFaultyLocations({ candidates: [0], parsed, ...t }), [0]);
		assert.deepEqual(t.calls, [[0]]);
	});
});

describe("configure with an error that names no line", () => {
	const dir = fs.mkdtempSync(join(tmpdir(), "npm-isolate-"));
	const file = (id) => join(dir, `${id}.conf`);
	const original = {};
	let tests = 0;

	// nginx checks variables after parsing: it names neither file nor line for an unknown one
	const fakeNginxTest = async () => {
		tests++;
		for (const name of fs.readdirSync(dir).filter((f) => f.endsWith(".conf"))) {
			const text = fs
				.readFileSync(join(dir, name), "utf8")
				.split("\n")
				.filter((line) => !line.trim().startsWith("#"))
				.join("\n");
			const m = text.match(/\$(missing_[a-z]+)/);
			if (m) {
				throw new Error(
					`nginx: [emerg] unknown "${m[1]}" variable\nnginx: configuration file /etc/nginx/nginx.conf test failed`,
				);
			}
		}
		return "";
	};
	const modeResolver = Object.assign(async () => ({ mode: "static", status: "ok" }), {
		hasResolver: false,
		dynamicEnabled: false,
	});

	before(() => {
		for (const key of ["getConfigName", "test", "listManagedFiles"]) {
			original[key] = internalNginx[key];
		}
		internalNginx.getConfigName = (_hostType, id) => file(id);
		internalNginx.test = fakeNginxTest;
		internalNginx.listManagedFiles = () => [];
	});
	after(async () => {
		Object.assign(internalNginx, original);
		fs.rmSync(dir, { recursive: true, force: true });
		await db.destroy();
	});
	beforeEach(() => {
		tests = 0;
	});
	afterEach(() => {
		for (const name of fs.readdirSync(dir)) {
			fs.rmSync(join(dir, name));
		}
	});

	let nextId = 1;
	const location = (path, advanced_config = "") => ({
		path,
		forward_scheme: "http",
		forward_host: "app",
		forward_port: 80,
		forward_path: "",
		advanced_config,
	});
	const insertHost = async (locations, advanced_config = "") => {
		const id = nextId++;
		const row = {
			id,
			owner_user_id: 1,
			certificate_id: 0,
			enabled: 1,
			meta: {},
			domain_names: [`h${id}.example.com`],
			forward_scheme: "http",
			forward_host: "app",
			forward_port: 80,
			access_list_id: 0,
			advanced_config,
			locations,
		};
		await db("proxy_host").insert({
			...row,
			meta: "{}",
			domain_names: JSON.stringify(row.domain_names),
			locations: JSON.stringify(locations),
			...ts,
		});
		return row;
	};
	const configure = (host) =>
		internalNginx.configureHost(proxyHostModel, "proxy_host", host, { reload: false, modeResolver });

	it("quarantines the location that uses an unknown variable, the host stays online", async () => {
		const host = await insertHost([
			location("/ok"),
			location("/bad", "proxy_set_header X-Test $missing_variable;"),
			location("/also-ok"),
		]);
		const meta = await configure(host);

		assert.equal(meta.nginx_online, true);
		assert.deepEqual(
			meta.nginx_locations.map((l) => l.status),
			["ok", "quarantined", "ok"],
		);
		assert.match(meta.nginx_locations[1].message, /unknown variable "\$missing_variable"/);
		const text = fs.readFileSync(file(host.id), "utf8");
		assert.doesNotMatch(text, /\$missing_variable/);
		assert.match(text, /location \/bad \{\n\s+# npm: quarantined[^\n]*\n\s+return 503;/);
		assert.match(text, /location \/ok \{/);
		const stored = JSON.parse((await db("proxy_host").where("id", host.id).first()).meta);
		assert.equal(stored.nginx_locations[1].status, "quarantined");
	});

	it("quarantines every location when only all of them together are the cause", async () => {
		const host = await insertHost([
			location("/a", "add_header X-A $missing_a;"),
			location("/b", "add_header X-B $missing_b;"),
		]);
		const meta = await configure(host);
		assert.equal(meta.nginx_online, true);
		assert.deepEqual(
			meta.nginx_locations.map((l) => l.status),
			["quarantined", "quarantined"],
		);
	});

	it("quarantines only the broken locations when two of them fail with the same error", async () => {
		const host = await insertHost([
			location("/a", "add_header X-A $missing_same;"),
			location("/clean"),
			location("/b", "add_header X-B $missing_same;"),
		]);
		const meta = await configure(host);
		assert.equal(meta.nginx_online, true);
		assert.deepEqual(
			meta.nginx_locations.map((l) => l.status),
			["quarantined", "ok", "quarantined"],
		);
		const text = fs.readFileSync(file(host.id), "utf8");
		assert.doesNotMatch(text, /\$missing_same/);
		assert.match(text, /location \/clean \{\n(?!\s+# npm: quarantined)/);
	});

	it("keeps the config that failed, not a stubbed variant, as .err in bulk mode", async () => {
		const host = await insertHost([location("/ok")], "add_header X-Test $missing_variable;");
		const meta = await internalNginx.configureHost(proxyHostModel, "proxy_host", host, {
			reload: false,
			modeResolver,
			offlineOnError: true,
		});
		assert.equal(meta.nginx_online, false);
		assert.match(meta.nginx_err, /^Advanced configuration: unknown variable "\$missing_variable"/);
		assert.doesNotMatch(meta.nginx_err, /another host/);
		assert.equal(fs.existsSync(file(host.id)), false);
		const err = fs.readFileSync(`${file(host.id)}.err`, "utf8");
		assert.match(err, /\$missing_variable/);
		assert.match(err, /location \/ok \{/);
		assert.match(err, /proxy_pass/);
		assert.doesNotMatch(err, /return 503;/);
	});

	it("still rejects the host when its own advanced config uses the unknown variable", async () => {
		const host = await insertHost([location("/ok")], "add_header X-Test $missing_variable;");
		await assert.rejects(configure(host), (err) => {
			assert.equal(err.details.scope, "host");
			assert.equal(err.details.location_index, null);
			// the host itself is at fault (the error stays with every other host moved aside), not a conflict
			assert.match(err.message, /^Advanced configuration: unknown variable "\$missing_variable"/);
			assert.doesNotMatch(err.message, /another host/);
			return true;
		});
		// the stubbing never touched the location and nothing was left behind
		assert.equal(fs.existsSync(file(host.id)), false);
		const stored = JSON.parse((await db("proxy_host").where("id", host.id).first()).meta);
		assert.equal(stored.nginx_locations, undefined);
		// error, without this host, all stubbed, alone: no test per location
		assert.equal(tests, 4);
	});

	it("rejects a host without locations whose advanced config uses an unknown variable as its own error", async () => {
		const host = await insertHost([], "add_header X-Test $missing_variable;");
		await assert.rejects(configure(host), (err) => {
			assert.equal(err.details.scope, "host");
			assert.match(err.message, /^Advanced configuration: unknown variable "\$missing_variable"/);
			assert.doesNotMatch(err.message, /another host/);
			return true;
		});
	});
});
