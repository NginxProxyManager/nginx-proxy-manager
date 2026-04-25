const migrate_name = "proxy_protocol";
import { migrate as logger } from "../logger.js";

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrate_name}] Migrating Up...`);

	return knex.schema.table("proxy_host", (table) => {
		table.integer("enable_proxy_protocol").notNull().unsigned().defaultTo(0);
		table.string("load_balancer_ip").notNull().defaultTo("");
	}).then(() => {
		logger.info(`[${migrate_name}] proxy_host Table altered`);
	});
};

/**
 * Undo Migrate
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const down = (_knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	return knex.schema.table("proxy_host", (table) => {
		table.dropColumn("enable_proxy_protocol");
		table.dropColumn("load_balancer_ip");
	})
	.then(() => {
		logger.info(`[${migrateName}] proxy_host Table altered`);
	});
};

export { up, down };
