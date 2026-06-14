import { migrate as logger } from "../logger.js";

const migrateName = "redirection_status_code";

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
		.table("redirection_host", (table) => {
			table.integer("forward_http_code").notNull().unsigned().defaultTo(302);
		})
		.then(() => {
			logger.info(`[${migrateName}] redirection_host Table altered`);
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
		.table("redirection_host", (table) => {
			table.dropColumn("forward_http_code");
		})
		.then(() => {
			logger.info(`[${migrateName}] redirection_host Table altered`);
		});
};

export { up, down };
