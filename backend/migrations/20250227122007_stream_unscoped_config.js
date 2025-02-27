const migrate_name = 'stream_unscoped_config';
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

	return knex.schema.table('stream', (table) => {
		table.text('unscoped_config').notNull().defaultTo('');
	})
		.then(function () {
			logger.info('[' + migrate_name + '] stream Table altered');
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

	return knex.schema.table('stream', (table) => {
		table.dropColumn('unscoped_config');
	})
		.then(function () {
			logger.info('[' + migrate_name + '] stream Table altered');
		});
};
