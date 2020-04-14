const migrate_name = 'access_list_client';
const logger       = require('../logger').migrate;

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object}  knex
 * @param   {Promise} Promise
 * @returns {Promise}
 */
exports.up = function (knex/*, Promise*/) {

	logger.info('[' + migrate_name + '] Migrating Up...');

	return knex.schema.createTable('access_list_client', (table) => {
		table.increments().primary();
		table.dateTime('created_on').notNull();
		table.dateTime('modified_on').notNull();
		table.integer('access_list_id').notNull().unsigned();
		table.string('address').notNull();
		table.string('directive').notNull();
		table.json('meta').notNull();

	})
		.then(function () {
			logger.info('[' + migrate_name + '] access_list_client Table created');

			return knex.schema.table('access_list', function (access_list) {
				access_list.integer('satify_any').notNull().defaultTo(0);
			});
		})
		.then(() => {
			logger.info('[' + migrate_name + '] access_list Table altered');
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

	return knex.schema.dropTable('access_list_client')
		.then(() => {
			logger.info('[' + migrate_name + '] access_list_client Table dropped');
		});
};
