const migrate_name = 'drop_unauthorized';
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

	return knex.schema.table('proxy_host', function(proxy_host) {
		proxy_host.integer('drop_unauthorized').notNull().unsigned().defaultTo(0);
	}).then(() =>{
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

	return knex.schema.table('proxy_host', function(proxy_host) {
		proxy_host.dropColumn('drop_unauthorized');
	}).then(() =>{
		logger.info('[' + migrate_name + '] Migrating Up Complete');
	});
};
