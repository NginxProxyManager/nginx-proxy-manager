import { migrate as logger } from "../logger.js";

const migrateName = "access_list_default_allow";

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema
		.table("access_list", (access_list) => {
			access_list.integer("default_allow").notNull().defaultTo(0);
		})
		.then(() => {
			logger.info(`[${migrateName}] access_list Table altered`);
		});
};

/**
 * Undo Migrate
 *
 * @param {Object} knex
 * @returns {Promise}
 */
const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	return knex.schema
		.table("access_list", (access_list) => {
			access_list.dropColumn("default_allow");
		})
		.then(() => {
			logger.info(`[${migrateName}] access_list default_allow Column dropped`);
		});
};

export { up, down };
