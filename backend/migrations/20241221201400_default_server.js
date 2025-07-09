const migrate_name = 'default_server';
const logger       = require('../logger').migrate;

/**
 * Migrate Up
 *
 * @param {Object} knex
 * @param {Promise} Promise
 * @returns {Promise}
 */
exports.up = function (knex) {
	logger.info(`[${migrate_name}] Migrating Up...`);

	// Add default_server column to proxy_host table
	return knex.schema.table('proxy_host', (table) => {
		table.boolean('default_server').notNullable().defaultTo(false);
	})
		.then(() => {
			logger.info(`[${migrate_name}] Column 'default_server' added to 'proxy_host' table`);
		});
};

/**
 * Migrate Down
 *
 * @param {Object} knex
 * @param {Promise} Promise
 * @returns {Promise}
 */
exports.down = function (knex) {
	logger.info(`[${migrate_name}] Migrating Down...`);

	// Remove default_server column from proxy_host table
	return knex.schema.table('proxy_host', (table) => {
		table.dropColumn('default_server');
	})
		.then(() => {
			logger.info(`[${migrate_name}] Column 'default_server' removed from 'proxy_host' table`);
		});
};
