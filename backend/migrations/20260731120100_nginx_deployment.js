import { migrate as logger } from "../logger.js";

const migrateName = "nginx_deployment";

export const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);
	await knex.schema.createTable("nginx_deployment", (table) => {
		table.increments("id").primary();
		table.string("operation_id", 36).notNullable().unique();
		table.string("parent_operation_id", 36).nullable().index();
		table.string("host_type", 32).notNullable();
		table.integer("host_id").unsigned().nullable();
		table.integer("owner_user_id").unsigned().nullable();
		table.string("operation", 32).notNullable();
		table.string("state", 32).notNullable().index();
		table.integer("requested_revision").unsigned().nullable();
		table.string("payload_hash", 71).nullable();
		table.string("dependency_hash", 71).nullable();
		table.string("template_version", 80).nullable();
		table.string("template_hash", 71).nullable();
		table.string("capability_hash", 71).nullable();
		table.string("config_hash", 71).nullable();
		table.string("candidate_path", 255).nullable();
		table.json("diagnostics").nullable();
		table.json("journal_summary").nullable();
		table.dateTime("started_on").notNullable();
		table.dateTime("finished_on").nullable();
		table.dateTime("created_on").notNullable();
		table.dateTime("modified_on").notNullable();
		table.index(["host_type", "host_id", "id"]);
	});
	logger.info(`[${migrateName}] nginx_deployment Table created`);
};

export const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	await knex.schema.dropTableIfExists("nginx_deployment");
};
