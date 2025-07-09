const migrate_name = 'identifier_for_migrate';
const logger       = require('../logger').migrate;

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param {Object} knex
 * @param {Promise} Promise
 * @returns {Promise}
 */
exports.up = function (knex) {

	logger.info(`[${migrate_name}] Migrating Up...`);

	return knex.schema.alterTable('proxy_host', (table) => {
		table.enum('ssl_key_type', ['ecdsa', 'rsa']).defaultTo('ecdsa').notNullable();
	}).then(() => {
		logger.info(`[${migrate_name}] Column 'ssl_key_type' added to table 'proxy_host'`);

		return knex.schema.alterTable('certificate', (table) => {
			table.enum('ssl_key_type', ['ecdsa', 'rsa']).defaultTo('ecdsa').notNullable();
		});
	}).then(() => {
		logger.info(`[${migrate_name}] Column 'ssl_key_type' added to table 'proxy_host'`);
	});
};

/**
 * Undo Migrate
 *
 * @param {Object} knex
 * @param {Promise} Promise
 * @returns {Promise}
 */
exports.down = function (knex) {
	logger.info(`[${migrate_name}] Migrating Down...`);

	return knex.schema.alterTable('proxy_host', (table) => {
		table.dropColumn('ssl_key_type');
	}).then(() => {
		logger.info(`[${migrate_name}] Column 'ssl_key_type' removed from table 'proxy_host'`);

		return knex.schema.alterTable('certificate', (table) => {
			table.dropColumn('ssl_key_type');
		});
	}).then(() => {
		logger.info(`[${migrate_name}] Column 'ssl_key_type' removed from table 'proxy_host'`);
	});
};
