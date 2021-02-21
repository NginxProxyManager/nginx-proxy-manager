const migrate_name = 'pass_auth';
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

	return knex.schema.table('access_list', function (access_list) {
		access_list.integer('pass_auth').notNull().defaultTo(1);
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

	return knex.schema.table('access_list', function (access_list) {
		access_list.dropColumn('pass_auth');
	})
		.then(() => {
			logger.info('[' + migrate_name + '] access_list pass_auth Column dropped');
		});
};
