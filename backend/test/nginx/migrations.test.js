import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import knex from "knex";
import test from "node:test";
import { down as downDeployment, up as upDeployment } from "../../migrations/20260731120100_nginx_deployment.js";
import { down as downProxyHost, up as upProxyHost } from "../../migrations/20260731120000_proxy_host_nginx_desired_applied.js";
import { down as downMonitoring, up as upMonitoring } from "../../migrations/20260803110000_proxy_host_monitoring.js";

const externalClient = process.env.NPM_MIGRATION_TEST_CLIENT;
const connection = externalClient === "mysql2"
	? { host: process.env.NPM_MIGRATION_MYSQL_HOST || "127.0.0.1", port: Number(process.env.NPM_MIGRATION_MYSQL_PORT || 3306), user: process.env.NPM_MIGRATION_MYSQL_USER || "npm", password: process.env.NPM_MIGRATION_MYSQL_PASSWORD || "npmpass", database: process.env.NPM_MIGRATION_MYSQL_DATABASE || "npm" }
	: externalClient === "pg"
		? { host: process.env.NPM_MIGRATION_POSTGRES_HOST || "127.0.0.1", port: Number(process.env.NPM_MIGRATION_POSTGRES_PORT || 5432), user: process.env.NPM_MIGRATION_POSTGRES_USER || "npm", password: process.env.NPM_MIGRATION_POSTGRES_PASSWORD || "npmpass", database: process.env.NPM_MIGRATION_POSTGRES_DATABASE || "npm" }
		: null;

const client = externalClient || "better-sqlite3";
let sqliteBindingAvailable = true;
if (!externalClient) {
	try {
		const BetterSqlite = (await import("better-sqlite3")).default;
		const probe = new BetterSqlite(":memory:");
		probe.close();
	} catch {
		sqliteBindingAvailable = false;
	}
}

const setupDatabase = async () => {
	const directory = connection ? null : await mkdtemp(join(tmpdir(), "npm-nginx-migration-"));
	const database = knex({ client, connection: connection || { filename: join(directory, "migration.sqlite") }, useNullAsDefault: !connection });
	await database.schema.dropTableIfExists("nginx_deployment");
	await database.schema.dropTableIfExists("proxy_host");
	await database.schema.createTable("proxy_host", (table) => {
		table.increments("id").primary();
		table.boolean("enabled").notNullable().defaultTo(true);
	});
	await database("proxy_host").insert({ enabled: true });
	return { database, directory };
};

test(`MIG-001 desired/applied schema migrates and rolls back on ${client}`, { skip: !sqliteBindingAvailable && !externalClient ? "better-sqlite3 native binding is unavailable in this host runtime" : false }, async () => {
	const { database, directory } = await setupDatabase();
	try {
		await upProxyHost(database);
		await upDeployment(database);
		const proxyColumns = await database("proxy_host").columnInfo();
		for (const name of ["nginx_config", "nginx_config_revision", "nginx_applied_revision", "nginx_applied_enabled", "nginx_applied_hash", "nginx_deployment_status", "nginx_checked_at", "nginx_last_error", "nginx_applied_snapshot", "nginx_last_deployment_id"]) assert.ok(proxyColumns[name], `${name} exists`);
		const row = await database("proxy_host").first();
		assert.equal(row.nginx_config_revision, 1);
		assert.equal(row.nginx_deployment_status, "pending");
		assert.ok(await database.schema.hasTable("nginx_deployment"));
		await downDeployment(database);
		await downProxyHost(database);
		assert.equal(await database.schema.hasTable("nginx_deployment"), false);
		const rolledBack = await database("proxy_host").columnInfo();
		assert.equal(rolledBack.nginx_config, undefined);
	} finally {
		await database.destroy();
		if (directory) await rm(directory, { recursive: true, force: true });
	}
});


test(`MIG-002 proxy host monitoring schema migrates and rolls back on ${client}`, { skip: !sqliteBindingAvailable && !externalClient ? "better-sqlite3 native binding is unavailable in this host runtime" : false }, async () => {
	const { database, directory } = await setupDatabase();
	try {
		await upMonitoring(database);
		for (const name of ["proxy_host_monitor_config", "proxy_host_monitor_state", "proxy_host_metric_minute", "proxy_host_metric_hour", "proxy_host_monitor_event", "monitor_ingestion_cursor"]) assert.equal(await database.schema.hasTable(name), true, `${name} exists`);
		const configColumns = await database("proxy_host_monitor_config").columnInfo();
		for (const name of ["proxy_host_id", "passive_desired_enabled", "passive_applied_enabled", "probe_mode", "expected_statuses", "degraded_p95_ms"]) assert.ok(configColumns[name], `${name} exists`);
		await downMonitoring(database);
		assert.equal(await database.schema.hasTable("proxy_host_monitor_config"), false);
		assert.equal(await database.schema.hasTable("proxy_host_metric_hour"), false);
	} finally {
		await database.destroy();
		if (directory) await rm(directory, { recursive: true, force: true });
	}
});
