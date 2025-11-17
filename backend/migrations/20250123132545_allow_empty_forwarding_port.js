import { migrate as logger } from "../logger.js";

const migrateName = "allow_empty_forwarding_port";

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
		.alterTable("proxy_host", (table) => {
			table.integer("forward_port").unsigned().alter();
		})
		.then(() => {
			logger.info(`[${migrateName}] proxy Table altered`);
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
		.alterTable("proxy_host", (table) => {
			table.integer("forward_port").notNull().unsigned().alter();
		})
		.then(() => {
			logger.info(`[${migrateName}] proxy Table altered`);
		});
};

export { up, down };
