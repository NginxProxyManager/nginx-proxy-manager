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
exports.up = function (knex/*, Promise*/) {

	logger.info('[' + migrate_name + '] Migrating Up...');

	return knex.schema.alterTable('auth', (table) => {
		table.string('mfa_secret');
		table.boolean('mfa_enabled').defaultTo(false);
	})
		.then(() => {
			logger.info('[' + migrate_name + '] User Table altered');
			logger.info('[' + migrate_name + '] Migrating Up Complete');
		});
};

/**
 * Undo Migrate
 *
 * @param {Object} knex
 * @param {Promise} Promise
 * @returns {Promise}
 */
exports.down = function (knex/*, Promise*/) {
	logger.info('[' + migrate_name + '] Migrating Down...');

	return knex.schema.alterTable('auth', (table) => {
		table.dropColumn('mfa_key');
		table.dropColumn('mfa_enabled');
	})
		.then(() => {
			logger.info('[' + migrate_name + '] User Table altered');
			logger.info('[' + migrate_name + '] Migrating Down Complete');
		});
};
