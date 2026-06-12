import { migrate as logger } from "../logger.js";

const migrateName = "agent-table";

const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);
	return knex.schema.hasTable("agent").then((exists) => {
		if (exists) {
			logger.info(`[${migrateName}] agent Table already exists`);
			return;
		}
		return knex.schema.createTable("agent", (table) => {
			table.increments().primary();
			table.dateTime("created_on").notNull();
			table.dateTime("modified_on").notNull();
			table.integer("is_deleted").notNull().unsigned().defaultTo(0);
			table.integer("enabled").notNull().unsigned().defaultTo(1);
			table.string("name").notNull();
			table.string("url").notNull();
			table.string("identity").notNull();
			table.text("secret").notNull();
			table.json("meta").notNull();
			table.unique("url");
		});
	});
};

const down = (knex) => {
	logger.warn(`[${migrateName}] Migrating Down...`);
	return knex.schema.dropTableIfExists("agent");
};

export { up, down };
