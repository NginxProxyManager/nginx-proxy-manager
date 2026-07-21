import { migrate as logger } from "../logger.js";

const migrateName = "proxy_host_upstream";

/**
 * Migrate
 * Extends proxy_host table with upstream_servers and lb_method fields for load balancing support
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
			table.json("upstream_servers").defaultTo("[]");
			table.string("lb_method").notNullable().defaultTo("round_robin");
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
const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	return knex.schema
		.alterTable("proxy_host", (table) => {
			table.dropColumn("upstream_servers");
			table.dropColumn("lb_method");
		})
		.then(() => {
			logger.info(`[${migrateName}] proxy_host Table altered`);
		});
};

export { up, down };
