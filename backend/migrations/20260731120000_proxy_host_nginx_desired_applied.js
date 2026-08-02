import { migrate as logger } from "../logger.js";

const migrateName = "proxy_host_nginx_desired_applied";

export const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);
	await knex.schema.alterTable("proxy_host", (table) => {
		table.json("nginx_config").nullable();
		table.integer("nginx_config_revision").unsigned().notNullable().defaultTo(1);
		table.integer("nginx_applied_revision").unsigned().nullable();
		table.tinyint("nginx_applied_enabled").notNullable().defaultTo(0);
		table.string("nginx_applied_hash", 71).nullable();
		table.string("nginx_deployment_status", 20).notNullable().defaultTo("pending");
		table.dateTime("nginx_checked_at").nullable();
		table.json("nginx_last_error").nullable();
		table.json("nginx_applied_snapshot").nullable();
		table.integer("nginx_last_deployment_id").unsigned().nullable();
	});
	// Do not infer Applied from enabled: migration has no authority to inspect the
	// active filesystem. Startup reconciliation establishes that relationship.
	await knex("proxy_host").update({
		nginx_config: JSON.stringify({ schema_version: 1 }),
		nginx_config_revision: 1,
		nginx_deployment_status: "pending",
	});
	logger.info(`[${migrateName}] proxy_host Table altered`);
};

export const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	await knex.schema.alterTable("proxy_host", (table) => {
		table.dropColumn("nginx_last_deployment_id");
		table.dropColumn("nginx_applied_snapshot");
		table.dropColumn("nginx_last_error");
		table.dropColumn("nginx_checked_at");
		table.dropColumn("nginx_deployment_status");
		table.dropColumn("nginx_applied_hash");
		table.dropColumn("nginx_applied_enabled");
		table.dropColumn("nginx_applied_revision");
		table.dropColumn("nginx_config_revision");
		table.dropColumn("nginx_config");
	});
};
