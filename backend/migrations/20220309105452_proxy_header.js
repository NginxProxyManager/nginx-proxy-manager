const migrate_name = 'proxy_header';
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

	return knex.schema.table('proxy_host', function (proxy_host) {
		proxy_host.integer('forward_proxy_header').notNull().unsigned().defaultTo(1);
	})
		.then(() => {
			logger.info('[' + migrate_name + '] proxy_host Table altered');
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
		table.dropColumn('forward_proxy_header');
	})
		.then(function () {
			logger.info('[' + migrate_name + '] proxy_host Table altered');
		});
};