const migrate_name = 'openid_connect';
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
		proxy_host.integer('openidc_enabled').notNull().unsigned().defaultTo(0);
		proxy_host.text('openidc_redirect_uri').notNull().defaultTo('');
		proxy_host.text('openidc_discovery').notNull().defaultTo('');
		proxy_host.text('openidc_auth_method').notNull().defaultTo('');
		proxy_host.text('openidc_client_id').notNull().defaultTo('');
		proxy_host.text('openidc_client_secret').notNull().defaultTo('');
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
exports.down = function (knex/*, Promise*/) {
	return knex.schema.table('proxy_host', function (proxy_host) {
		proxy_host.dropColumn('openidc_enabled');
		proxy_host.dropColumn('openidc_redirect_uri');
		proxy_host.dropColumn('openidc_discovery');
		proxy_host.dropColumn('openidc_auth_method');
		proxy_host.dropColumn('openidc_client_id');
		proxy_host.dropColumn('openidc_client_secret');
	})
		.then(() => {
			logger.info('[' + migrate_name + '] proxy_host Table altered');
		});
};
