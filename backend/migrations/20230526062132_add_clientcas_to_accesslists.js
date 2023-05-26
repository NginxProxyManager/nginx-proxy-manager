const migrate_name = 'client_certificates';
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

	return knex.schema.createTable('access_list_clientcas', (table) => {
		table.increments().primary();
		table.dateTime('created_on').notNull();
		table.dateTime('modified_on').notNull();
		table.integer('access_list_id').notNull().unsigned();
		table.integer('certificate_id').notNull().unsigned();
		table.json('meta').notNull();
	})
		.then(function () {
			logger.info('[' + migrate_name + '] access_list_clientcas Table created');
		})
		.then(() => {
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

	return knex.schema.dropTable('access_list_clientcas')
		.then(() => {
			logger.info('[' + migrate_name + '] access_list_clientcas Table dropped');
		})
		.then(() => {
			logger.info('[' + migrate_name + '] Migrating Down Complete');
		});
};
