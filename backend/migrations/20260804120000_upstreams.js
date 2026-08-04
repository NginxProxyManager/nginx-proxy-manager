import { migrate as logger } from "../logger.js";

const migrateName = "upstreams";

export const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	await knex.schema.createTable("upstream", (table) => {
		table.increments("id").primary();
		table.dateTime("created_on").notNullable();
		table.dateTime("modified_on").notNullable();
		table.integer("owner_user_id").unsigned().notNullable();
		table.tinyint("is_deleted").notNullable().defaultTo(0);
		table.tinyint("is_disabled").notNullable().defaultTo(0);
		table.string("name", 255).notNullable();
		table.string("nginx_key", 63).notNullable().unique();
		table.string("load_balancing_method", 32).notNullable().defaultTo("round_robin");
		table.string("zone_size", 16).notNullable().defaultTo("64k");
		table.integer("nginx_config_revision").unsigned().notNullable().defaultTo(1);
		table.integer("nginx_applied_revision").unsigned().nullable();
		table.tinyint("nginx_applied_enabled").notNullable().defaultTo(0);
		table.string("nginx_applied_hash", 71).nullable();
		table.string("nginx_deployment_status", 20).notNullable().defaultTo("pending");
		table.dateTime("nginx_checked_at").nullable();
		table.json("nginx_last_error").nullable();
		table.json("nginx_applied_snapshot").nullable();
		table.integer("nginx_last_deployment_id").unsigned().nullable();
		table.index(["owner_user_id", "is_deleted"]);
		table.index(["nginx_deployment_status"]);
	});

	await knex.schema.createTable("upstream_server", (table) => {
		table.increments("id").primary();
		table.dateTime("created_on").notNullable();
		table.dateTime("modified_on").notNullable();
		table.integer("upstream_id").unsigned().notNullable();
		table.string("host", 255).notNullable();
		table.integer("port").unsigned().notNullable();
		table.integer("weight").unsigned().notNullable().defaultTo(1);
		table.integer("max_fails").unsigned().notNullable().defaultTo(1);
		table.string("fail_timeout", 16).notNullable().defaultTo("10s");
		table.integer("max_conns").unsigned().nullable();
		table.tinyint("backup").notNullable().defaultTo(0);
		table.tinyint("down").notNullable().defaultTo(0);
		table.integer("sort_order").unsigned().notNullable().defaultTo(0);
		table.index(["upstream_id", "sort_order"]);
		table.foreign("upstream_id").references("upstream.id").onDelete("RESTRICT");
	});

	await knex.schema.alterTable("proxy_host", (table) => {
		table.json("default_target").nullable();
	});

	await knex.schema.createTable("proxy_host_upstream", (table) => {
		table.increments("id").primary();
		table.dateTime("created_on").notNullable();
		table.integer("proxy_host_id").unsigned().notNullable();
		table.integer("upstream_id").unsigned().notNullable();
		table.string("target_type", 16).notNullable();
		table.string("location_id", 36).notNullable().defaultTo("");
		table.unique(["proxy_host_id", "upstream_id", "target_type", "location_id"], "proxy_host_upstream_reference_unique");
		table.index(["upstream_id", "proxy_host_id"]);
		table.foreign("proxy_host_id").references("proxy_host.id").onDelete("RESTRICT");
		table.foreign("upstream_id").references("upstream.id").onDelete("RESTRICT");
	});

	await knex.schema.alterTable("user_permission", (table) => {
		table.string("upstreams").notNullable().defaultTo("manage");
	});

	logger.info(`[${migrateName}] Upstream tables and references created`);
};

export const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	await knex.schema.alterTable("user_permission", (table) => table.dropColumn("upstreams"));
	await knex.schema.dropTableIfExists("proxy_host_upstream");
	await knex.schema.alterTable("proxy_host", (table) => table.dropColumn("default_target"));
	await knex.schema.dropTableIfExists("upstream_server");
	await knex.schema.dropTableIfExists("upstream");
};
