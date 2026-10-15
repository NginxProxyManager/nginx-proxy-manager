import { migrate as logger } from "../logger.js";

const migrateName = "automation";

const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema
		.createTable("api_key", (table) => {
			table.increments().primary();
			table.dateTime("created_on").notNull();
			table.dateTime("modified_on").notNull();
			table.integer("owner_user_id").notNull().unsigned();
			table.integer("is_deleted").notNull().unsigned().defaultTo(0);
			table.integer("is_revoked").notNull().unsigned().defaultTo(0);
			table.string("name", 255).notNull();
			table.string("key_prefix", 16).notNull();
			table.string("key_hash", 255).notNull();
			table.json("permissions").notNull();
			table.dateTime("expires_on").nullable();
			table.dateTime("last_used_at").nullable();
		})
		.then(() => {
			logger.info(`[${migrateName}] api_key table created`);
			return knex.schema.createTable("job", (table) => {
				table.increments().primary();
				table.dateTime("created_on").notNull();
				table.dateTime("modified_on").notNull();
				table.integer("owner_user_id").notNull().unsigned();
				table.string("type", 64).notNull();
				table.string("status", 32).notNull();
				table.json("payload").notNull();
				table.json("result").nullable();
				table.text("error").nullable();
				table.dateTime("finished_on").nullable();
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] job table created`);
			return knex.schema.createTable("webhook_endpoint", (table) => {
				table.increments().primary();
				table.dateTime("created_on").notNull();
				table.dateTime("modified_on").notNull();
				table.integer("owner_user_id").notNull().unsigned();
				table.integer("is_deleted").notNull().unsigned().defaultTo(0);
				table.integer("is_enabled").notNull().unsigned().defaultTo(1);
				table.string("name", 255).notNull();
				table.string("url", 2048).notNull();
				table.string("secret_path", 255).notNull();
				table.json("events").notNull();
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] webhook_endpoint table created`);
		});
};

const down = (knex) => {
	return knex.schema
		.dropTableIfExists("webhook_endpoint")
		.then(() => knex.schema.dropTableIfExists("job"))
		.then(() => knex.schema.dropTableIfExists("api_key"));
};

export { up, down };
