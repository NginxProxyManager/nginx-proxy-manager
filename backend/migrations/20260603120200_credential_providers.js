import { migrate as logger } from "../logger.js";

const migrateName = "credential_providers";

const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema.createTable("credential_provider", (table) => {
		table.increments().primary();
		table.dateTime("created_on").notNull();
		table.dateTime("modified_on").notNull();
		table.integer("owner_user_id").notNull().unsigned();
		table.integer("is_deleted").notNull().unsigned().defaultTo(0);
		table.string("name", 255).notNull();
		table.string("type", 32).notNull();
		table.string("oidc_issuer", 2048).nullable();
		table.string("oidc_client_id", 512).nullable();
		table.string("oidc_client_secret_path", 255).nullable();
		table.string("oidc_audience", 512).nullable();
		table.string("oidc_scope", 512).nullable();
		table.json("meta").notNull();
	});
};

const down = (knex) => knex.schema.dropTableIfExists("credential_provider");

export { up, down };
