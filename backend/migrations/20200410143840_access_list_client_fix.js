import { migrate as logger } from "../logger.js";

const migrateName = "access_list_client_fix";

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
			access_list.renameColumn("satify_any", "satisfy_any");
		})
		.then(() => {
			logger.info(`[${migrateName}] access_list Table altered`);
		});
};

/**
 * Undo Migrate
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const down = (_knex) => {
	logger.warn(`[${migrateName}] You can't migrate down this one.`);
	return Promise.resolve(true);
};

export { up, down };
