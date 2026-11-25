import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { normalizeUpstreamName } from "../../backend/lib/upstream-servers.js";
import { down as downServers, up as upServers } from "../../backend/migrations/20260720000000_proxy_host_upstream.js";
import { down, up } from "../../backend/migrations/20260720000001_proxy_host_upstream_name.js";
import { down as downMode, up as upMode } from "../../backend/migrations/20260720000002_proxy_host_forwarding_mode.js";

const require = createRequire(new URL("../../backend/package.json", import.meta.url));
const knex = require("knex");

for (const client of ["sqlite3", "better-sqlite3"]) {
	test(`${client}: upstream name migration preserves legacy hosts and enforces unique canonical names`, async (t) => {
		const db = knex({ client, connection: { filename: ":memory:" }, useNullAsDefault: true });
		t.after(() => db.destroy());
		await db.schema.createTable("proxy_host", (table) => {
			table.increments("id");
			table.string("forward_host");
			table.integer("forward_port");
		});
		await db("proxy_host").insert([
			{ id: 1, forward_host: "legacy.internal", forward_port: 8080 },
			{ id: 2, forward_host: "other.internal", forward_port: 80 },
		]);
		await upServers(db);
		await up(db);
		await upMode(db);
		assert.equal((await db("proxy_host").where({ id: 1 }).first()).forwarding_mode, null);
		await db("proxy_host").where({ id: 1 }).update({ forwarding_mode: "direct" });
		assert.deepEqual(
			(await db("proxy_host").select("upstream_name")).map((row) => row.upstream_name),
			[null, null],
		);
		await db("proxy_host")
			.where({ id: 1 })
			.update({ upstream_name: normalizeUpstreamName("My_Backend") });
		await assert.rejects(
			db("proxy_host")
				.where({ id: 2 })
				.update({ upstream_name: normalizeUpstreamName("MY_BACKEND") }),
			/UNIQUE constraint failed/,
		);
		assert.equal((await db("proxy_host").where({ id: 2 }).first()).upstream_name, null);
		await db("proxy_host").where({ id: 1 }).update({ upstream_name: null });
		await db("proxy_host").where({ id: 2 }).update({ upstream_name: "my_backend" });
		await downMode(db);
		assert.equal(await db.schema.hasColumn("proxy_host", "forwarding_mode"), false);
		await down(db);
		await downServers(db);
		assert.equal(await db.schema.hasColumn("proxy_host", "upstream_servers"), false);
		assert.equal(await db.schema.hasColumn("proxy_host", "lb_method"), false);
		assert.deepEqual(await db("proxy_host").where({ id: 1 }).first(), {
			id: 1,
			forward_host: "legacy.internal",
			forward_port: 8080,
		});
		assert.equal(await db.schema.hasColumn("proxy_host", "upstream_name"), false);
		assert.equal((await db("proxy_host")).length, 2);
	});
}
