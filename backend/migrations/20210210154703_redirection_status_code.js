const migrate_name = 'redirection_status_code';
const logger       = require('../logger').migrate;

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object} knex
 * @param   {Promise} Promise
 * @returns {Promise}
 */
exports.up = function (knex/*, Promise*/) {

	logger.info('[' + migrate_name + '] Migrating Up...');

	return knex.schema.table('redirection_host', (table) => {
		table.integer('forward_http_code').notNull().unsigned().defaultTo(302);
	})
		.then(function () {
			logger.info('[' + migrate_name + '] redirection_host Table altered');
		});
};

/**
 * Undo Migrate
 *
 * @param   {Object} knex
 * @param   {Promise} Promise
 * @returns {Promise}
 */
exports.down = function (knex/*, Promise*/) {
	logger.info('[' + migrate_name + '] Migrating Down...');

	return knex.schema.table('redirection_host', (table) => {
		table.dropColumn('forward_http_code');
	})
		.then(function () {
			logger.info('[' + migrate_name + '] redirection_host Table altered');
		});
};
