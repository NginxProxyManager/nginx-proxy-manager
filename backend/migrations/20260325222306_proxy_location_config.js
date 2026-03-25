import { migrate as logger } from "../logger.js";

const migrateName = "proxy_location_config";

/**
 * Migrate
 *
 * @see https://knexjs.org/guide/migrations.html#migration-api
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema
		.table("proxy_host", (proxy_host) => {
			proxy_host.text("npmplus_location_config").notNull().defaultTo("");
		})
		.then(() => {
			logger.info(`[${migrateName}] proxy_host Table altered`);
		});
};

/**
 * Undo Migrate
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const down = (_knex) => {
	logger.warn(`[${migrateName}] You can't migrate down this one.`);
	return Promise.resolve(true);
};

export { up, down };
