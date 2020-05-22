const migrate_name = 'openid_allowed_users';
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
		proxy_host.integer('openidc_restrict_users_enabled').notNull().unsigned().defaultTo(0);
		proxy_host.json('openidc_allowed_users').notNull().defaultTo([]);
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
		proxy_host.dropColumn('openidc_restrict_users_enabled');
		proxy_host.dropColumn('openidc_allowed_users');
	})
		.then(() => {
			logger.info('[' + migrate_name + '] proxy_host Table altered');
		});
};
