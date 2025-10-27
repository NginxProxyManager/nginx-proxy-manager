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

	return knex.schema.table('proxy_host', function (proxy_host) {
		proxy_host.integer('proxy_send_timeout').notNull().defaultTo(60);
		proxy_host.integer('proxy_read_timeout').notNull().defaultTo(60);
		proxy_host.integer('proxy_connect_timeout').notNull().defaultTo(60);
	})
		.then(() => {
			logger.info('[' + migrate_name + '] proxy_host Table altered');
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

	return knex.schema.table('proxy_host', function (proxy_host) {
		proxy_host.dropColumn('proxy_send_timeout');
		proxy_host.dropColumn('proxy_read_timeout');
		proxy_host.dropColumn('proxy_connect_timeout');
	})
		.then(() => {
			logger.info('[' + migrate_name + '] proxy_host proxy_send_timeout, proxy_read_timeout, proxy_connect_timeout Columns dropped');
		});
};
