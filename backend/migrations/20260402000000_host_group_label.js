import { migrate as logger } from "../logger.js";

const migrateName = "host_group_label";

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = function (knex) {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema
		.alterTable('proxy_host', (table) => {
			table.string('host_group_label').notNullable().defaultTo('');
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
const down = function (knex) {
	logger.info(`[${migrateName}] Migrating Down...`);

	return knex.schema
		.alterTable('proxy_host', (table) => {
			table.dropColumn('host_group_label');
		})
		.then(() => {
			logger.info(`[${migrateName}] proxy_host Table altered`);
		});
};

export { up, down };
