const migrate_name = 'proxy_protocol';
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
		proxy_host.integer('enable_proxy_protocol').notNull().unsigned().defaultTo(0);
		proxy_host.string('load_balancer_ip').notNull().defaultTo('');
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
		proxy_host.dropColumn('enable_proxy_protocol');
		proxy_host.dropColumn('load_balancer_ip');
	})
		.then(function () {
			logger.info('[' + migrate_name + '] proxy_host Table altered');
		});
};