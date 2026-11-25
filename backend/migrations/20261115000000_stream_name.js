import { migrate as logger } from "../logger.js";

const migrateName = "stream_name";

/**
 * Migrate
 *
 * Adds an optional, display-only name to streams.
 * It is never written into nginx config.
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema
		.alterTable("stream", (table) => {
			table.string("name", 100).notNullable().defaultTo("");
		})
		.then(() => {
			logger.info(`[${migrateName}] stream Table altered`);
		});
};

/**
 * Undo Migrate
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	return knex.schema
		.alterTable("stream", (table) => {
			table.dropColumn("name");
		})
		.then(() => {
			logger.info(`[${migrateName}] stream Table altered`);
		});
};

export { up, down };
