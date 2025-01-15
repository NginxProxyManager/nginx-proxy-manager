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

	return knex.schema.alterTable('user', (table) => {
		table.string('mfa_secret');
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

	return knex.schema.alterTable('user', (table) => {
		table.dropColumn('mfa_key');
	})
		.then(() => {
			logger.info('[' + migrate_name + '] User Table altered');
			logger.info('[' + migrate_name + '] Migrating Down Complete');
		});
};
