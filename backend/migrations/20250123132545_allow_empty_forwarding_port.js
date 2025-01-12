const migrate_name = 'allow_empty_forwarding_port';
const logger = require('../logger').migrate;

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object} knex
 * @param   {Promise} Promise
 * @returns {Promise}
 */
exports.up = function (knex /*, Promise */) {
	logger.info('[' + migrate_name + '] Migrating Up...');

	return knex.schema
		.alterTable('proxy_host', (table) => {
			table.integer('forward_port').unsigned().alter();
		})
		.then(function () {
			logger.info('[' + migrate_name + '] proxy Table altered');
		});
};

/**
 * Undo Migrate
 *
 * @param   {Object} knex
 * @param   {Promise} Promise
 * @returns {Promise}
 */
exports.down = function (knex /*, Promise */) {
	logger.info('[' + migrate_name + '] Migrating Down...');

	return knex.schema
		.alterTable('proxy_host', (table) => {
			table.integer('forward_port').notNull().unsigned().alter();
		})
		.then(function () {
			logger.info('[' + migrate_name + '] proxy Table altered');
		});
};
