const migrate_name = 'proxy_protocol';
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

	return knex.schema.table('proxy_host', (proxy_host) => {
		proxy_host.integer('enable_proxy_protocol').notNull().unsigned().defaultTo(0);
		proxy_host.string('load_balancer_ip').notNull().defaultTo('');
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
	logger.warn(`[${migrate_name}] You can't migrate down this one.`);
	return Promise.resolve(true);
};

export { up, down };
