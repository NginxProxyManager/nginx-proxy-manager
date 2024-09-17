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
	logger.info('[' + migrate_name + '] Migrating Up...');

	return knex.schema.table('proxy_host', function (table) {
		table.string('remark', 100).nullable().defaultTo('');
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
exports.down = function (knex) {
	logger.info('[' + migrate_name + '] Migrating Down...');

	return knex.schema.table('proxy_host', function (table) {
		table.dropColumn('remark');
		logger.info('[' + migrate_name + '] Migrating Down Complete');
	});
};
