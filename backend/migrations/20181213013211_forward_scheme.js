import { migrate as logger } from "../logger.js";

const migrateName = "forward_scheme";

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
			proxy_host.string("forward_scheme").notNull().defaultTo("http");
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
