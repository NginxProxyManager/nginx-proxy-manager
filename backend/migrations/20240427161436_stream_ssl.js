import { migrate as logger } from "../logger.js";

const migrateName = "stream_ssl";

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema
		.table("stream", (table) => {
			table.integer("certificate_id").notNull().unsigned().defaultTo(0);
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
		.table("stream", (table) => {
			table.dropColumn("certificate_id");
		})
		.then(() => {
			logger.info(`[${migrateName}] stream Table altered`);
		});
};

export { up, down };
