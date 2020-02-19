const migrate_name = 'custom_locations';
const logger       = require('../logger').migrate;

/**
 * Migrate
 * Extends proxy_host table with locations field
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object}  knex
 * @param   {Promise} Promise
 * @returns {Promise}
 */
exports.up = function (knex/*, Promise*/) {
	logger.info('[' + migrate_name + '] Migrating Up...');

	return knex.schema.table('proxy_host', function (proxy_host) {
		proxy_host.json('locations');
	})
		.then(() => {
			logger.info('[' + migrate_name + '] proxy_host Table altered');
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
