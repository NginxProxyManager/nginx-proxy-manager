import { migrate as logger } from "../logger.js";

const migrateName = "drop_unauthorized";

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param {Object} knex
 * @param {Promise} Promise
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema.table("proxy_host", (table) => {
		table.integer("drop_unauthorized").notNull().unsigned().defaultTo(0);
	}).then(() => {
		logger.info(`[${migrateName}] Migrating Up Complete`);
	});
};

/**
 * Undo Migrate
 *
 * @param {Object} knex
 * @param {Promise} Promise
 * @returns {Promise}
 */
const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	return knex.schema.table("proxy_host", (table) => {
		table.dropColumn("drop_unauthorized");
	}).then(() => {
		logger.info(`[${migrateName}] Migrating Down Complete`);
	});
};

export { up, down };
