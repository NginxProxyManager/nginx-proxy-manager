const migrate_name = 'stream_ssl';
const logger = require('../logger').migrate;

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
exports.up = function (knex) {
	logger.info('[' + migrate_name + '] Migrating Up...');

	return knex.schema
		.table('stream', (table) => {
			table.integer('certificate_id').notNull().unsigned().defaultTo(0);
		})
		.then(function () {
			logger.info('[' + migrate_name + '] stream Table altered');
		});
};

/**
 * Undo Migrate
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
exports.down = function (knex) {
	logger.info('[' + migrate_name + '] Migrating Down...');

	return knex.schema
		.table('stream', (table) => {
			table.dropColumn('certificate_id');
		})
		.then(function () {
			logger.info('[' + migrate_name + '] stream Table altered');
		});
};
