import { migrate as logger } from "../logger.js";

const migrateName = "pass_auth";

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
			access_list.integer("pass_auth").notNull().defaultTo(1);
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
			access_list.dropColumn("pass_auth");
		})
		.then(() => {
			logger.info(`[${migrateName}] access_list pass_auth Column dropped`);
		});
};

export { up, down };
