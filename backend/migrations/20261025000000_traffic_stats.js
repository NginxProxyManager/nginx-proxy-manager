import { migrate as logger } from "../logger.js";

const migrateName = "traffic_stats";

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	// Per host, per 5 minute bucket counters
	await knex.schema.createTable("traffic_stat", (table) => {
		table.bigInteger("bucket").notNull();
		table.string("host_type", 20).notNull();
		table.integer("host_id").unsigned().notNull();
		table.integer("requests").unsigned().notNull().defaultTo(0);
		table.integer("s2xx").unsigned().notNull().defaultTo(0);
		table.integer("s3xx").unsigned().notNull().defaultTo(0);
		table.integer("s4xx").unsigned().notNull().defaultTo(0);
		table.integer("s5xx").unsigned().notNull().defaultTo(0);
		table.bigInteger("bytes").unsigned().notNull().defaultTo(0);
		table.primary(["bucket", "host_type", "host_id"]);
		table.index("bucket");
	});
	logger.info(`[${migrateName}] traffic_stat Table created`);

	// Per host, per hour "top N" counters (client IPs, paths, ...)
	await knex.schema.createTable("traffic_stat_top", (table) => {
		table.bigInteger("bucket").notNull();
		table.string("host_type", 20).notNull();
		table.integer("host_id").unsigned().notNull();
		table.string("kind", 20).notNull();
		table.string("item", 255).notNull();
		table.integer("hits").unsigned().notNull().defaultTo(0);
		table.primary(["bucket", "host_type", "host_id", "kind", "item"]);
		table.index("bucket");
	});
	logger.info(`[${migrateName}] traffic_stat_top Table created`);

	// Where the ingest worker got up to in each log file
	await knex.schema.createTable("traffic_stat_cursor", (table) => {
		table.string("file", 255).notNull().primary();
		table.string("inode", 40).notNull().defaultTo("");
		table.bigInteger("position").unsigned().notNull().defaultTo(0);
	});
	logger.info(`[${migrateName}] traffic_stat_cursor Table created`);
};

/**
 * Undo Migrate
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	await knex.schema.dropTableIfExists("traffic_stat_cursor");
	await knex.schema.dropTableIfExists("traffic_stat_top");
	await knex.schema.dropTableIfExists("traffic_stat");
	logger.info(`[${migrateName}] Tables dropped`);
};

export { up, down };
