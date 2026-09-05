import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

const testRoot = await mkdtemp(path.join(os.tmpdir(), "npm-entrypoint-test-"));
process.env.NPM_KEYS_FILE = path.join(testRoot, "keys.json");
process.env.DB_SQLITE_FILE = path.join(testRoot, "database.sqlite");
process.env.NODE_CONFIG_DIR = path.join(testRoot, "config");

const [{ migrateUp }, { default: db }, { default: logRequest }] = await Promise.all([
	import("../migrate.js"),
	import("../db.js"),
	import("../lib/express/log-request.js"),
]);

after(async () => {
	await db().destroy();
});

test("database migration entrypoint applies the current schema to an empty SQLite database", async () => {
	const [batch, migrations] = await migrateUp();
	assert.ok(batch >= 1);
	assert.ok(migrations.length > 0);
	assert.equal(await db().schema.hasTable("proxy_host"), true);
});

test("request logger forwards control to the next middleware", () => {
	let called = false;
	logRequest({ method: "get", path: "/health" }, {}, () => { called = true; });
	assert.equal(called, true);
});
