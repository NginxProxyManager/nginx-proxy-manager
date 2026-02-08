import { migrate as logger } from "../logger.js";

const migrateName = "new_proxy_buttons";

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
		.table("proxy_host", (proxy_host) => {
			proxy_host.integer("npmplus_proxy_request_buffering").notNull().unsigned().defaultTo(0);
			proxy_host.integer("npmplus_proxy_response_buffering").notNull().unsigned().defaultTo(0);
			proxy_host.integer("npmplus_fancyindex_upstream_compression").notNull().unsigned().defaultTo(0);
			proxy_host.integer("npmplus_noindex").notNull().unsigned().defaultTo(0);
		})
		.then(() => {
			logger.info(`[${migrateName}] proxy_host Table altered`);
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
