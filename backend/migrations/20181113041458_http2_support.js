const migrate_name = 'http2_support';
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
		proxy_host.integer('http2_support').notNull().unsigned().defaultTo(0);
	})
		.then(() => {
			logger.info('[' + migrate_name + '] proxy_host Table altered');

			return knex.schema.table('redirection_host', function (redirection_host) {
				redirection_host.integer('http2_support').notNull().unsigned().defaultTo(0);
			});
		})
		.then(() => {
			logger.info('[' + migrate_name + '] redirection_host Table altered');

			return knex.schema.table('dead_host', function (dead_host) {
				dead_host.integer('http2_support').notNull().unsigned().defaultTo(0);
			});
		})
		.then(() => {
			logger.info('[' + migrate_name + '] dead_host Table altered');
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

