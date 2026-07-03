import { migrate as logger } from "../logger.js";

const migrateName = "credentials";

const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema
		.createTable("credential", (table) => {
			table.increments().primary();
			table.dateTime("created_on").notNull();
			table.dateTime("modified_on").notNull();
			table.integer("owner_user_id").notNull().unsigned();
			table.integer("is_deleted").notNull().unsigned().defaultTo(0);
			table.string("name", 255).notNull();
			table.string("dns_provider", 100).notNull();
			table.string("storage_path", 255).notNull();
			table.string("encryption_key_id", 32).notNull().defaultTo("v1");
			table.dateTime("last_used_at").nullable();
		})
		.then(() => {
			logger.info(`[${migrateName}] credential table created`);
			return knex.schema.table("user_permission", (table) => {
				table.string("credentials", 20).notNull().defaultTo("manage");
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] user_permission.credentials column added`);
		});
};

const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	return knex.schema
		.table("user_permission", (table) => {
			table.dropColumn("credentials");
		})
		.then(() => knex.schema.dropTableIfExists("credential"));
};

export { up, down };
