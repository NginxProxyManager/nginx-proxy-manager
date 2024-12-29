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
		proxy_host.integer('proxy_protocol_enabled').notNull().defaultTo(0);
		proxy_host.string('loadbalancer_address').notNull().defaultTo('');
	})
		.then(() => {
			logger.info('[' + migrate_name + '] proxy_host Table altered');

			return knex.schema.table('stream', function (stream) {
				stream.integer('proxy_protocol_enabled').notNull().defaultTo(0);
				stream.string('loadbalancer_address').notNull().defaultTo('');
			})
				.then(() => {
					logger.info('[' + migrate_name + '] stream Table altered');
				});
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
		proxy_host.dropColumn('proxy_protocol_enabled');
		proxy_host.dropColumn('loadbalancer_address');
	})
		.then(function () {
			logger.info('[' + migrate_name + '] proxy_host Table altered');
			return knex.schema.table('stream', function (stream) {
				stream.dropColumn('proxy_protocol_enabled');
				stream.dropColumn('loadbalancer_address');
			})
				.then(function () {
					logger.info('[' + migrate_name + '] stream Table altered');
				});
		});
};