import { migrate as logger } from "../logger.js";

const migrateName = "stream_domain";

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
			table.renameColumn("forward_ip", "forwarding_host");
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
			table.renameColumn("forwarding_host", "forward_ip");
		})
		.then(() => {
			logger.info(`[${migrateName}] stream Table altered`);
		});
};

export { up, down };
