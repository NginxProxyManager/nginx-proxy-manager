const migrate_name = 'access_list_client_fix';
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
		access_list.renameColumn('satify_any', 'satisfy_any');
	})
		.then(() => {
			logger.info('[' + migrate_name + '] access_list Table altered');
		});
};

/**
 * Undo Migrate
 *
 * @param   {Object}  knex
 * @param   {Promise} Promise
 * @returns {Promise}
 */
exports.down = function (knex, Promise) {
	logger.warn('[' + migrate_name + '] You can\'t migrate down this one.');
	return Promise.resolve(true);
};
