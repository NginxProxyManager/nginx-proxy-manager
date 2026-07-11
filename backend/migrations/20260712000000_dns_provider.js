import { migrate as logger } from "../logger.js";

const migrateName = "dns_provider";

const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema
		.createTable("dns_provider", (table) => {
			table.increments().primary();
			table.dateTime("created_on").notNull();
			table.dateTime("modified_on").notNull();
			table.integer("owner_user_id").notNull().unsigned();
			table.integer("is_deleted").notNull().unsigned().defaultTo(0);
			table.string("name").notNull();
			table.string("type").notNull();
			table.json("credentials").notNull();
			table.string("default_ip").notNull().defaultTo("");
			table.integer("ttl").notNull().unsigned().defaultTo(300);
			table.json("meta").notNull();
		})
		.then(() => {
			logger.info(`[${migrateName}] dns_provider Table created`);
			return knex.schema.alterTable("proxy_host", (table) => {
				table.integer("dns_provider_id").notNull().unsigned().defaultTo(0);
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] proxy_host Table altered`);
		});
};

const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	return knex.schema
		.alterTable("proxy_host", (table) => {
			table.dropColumn("dns_provider_id");
		})
		.then(() => knex.schema.dropTable("dns_provider"));
};

export { up, down };
