import { migrate as logger } from "../logger.js";

const migrateName = "user_permission_meta";

/**
 * Migrate
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema
		.alterTable("user_permission", (table) => {
			table.json("meta").nullable();
		})
		.then(() => {
			logger.info(`[${migrateName}] user_permission Table altered`);
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
		.alterTable("user_permission", (table) => {
			table.dropColumn("meta");
		})
		.then(() => {
			logger.info(`[${migrateName}] user_permission Table altered`);
		});
};

export { up, down };
