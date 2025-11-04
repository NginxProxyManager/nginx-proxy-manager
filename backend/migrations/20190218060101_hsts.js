import { migrate as logger } from "../logger.js";

const migrateName = "hsts";

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
			proxy_host.integer("hsts_enabled").notNull().unsigned().defaultTo(0);
			proxy_host.integer("hsts_subdomains").notNull().unsigned().defaultTo(0);
		})
		.then(() => {
			logger.info(`[${migrateName}] proxy_host Table altered`);

			return knex.schema.table("redirection_host", (redirection_host) => {
				redirection_host.integer("hsts_enabled").notNull().unsigned().defaultTo(0);
				redirection_host.integer("hsts_subdomains").notNull().unsigned().defaultTo(0);
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] redirection_host Table altered`);

			return knex.schema.table("dead_host", (dead_host) => {
				dead_host.integer("hsts_enabled").notNull().unsigned().defaultTo(0);
				dead_host.integer("hsts_subdomains").notNull().unsigned().defaultTo(0);
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] dead_host Table altered`);
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
