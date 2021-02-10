const migrate_name = 'redirection_scheme';
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
exports.up = function (knex, Promise) {

	logger.info('[' + migrate_name + '] Migrating Up...');

	return knex.schema.table('redirection_host', (table) => {
		 table.string('forward_scheme').notNull().defaultTo("$scheme");
	 })
	 .then(function () {
		logger.info('[' + migrate_name + '] redirection_host Table altered');
	 });

	logger.info('[' + migrate_name + '] Migrating Up Complete');

	return Promise.resolve(true);
};

/**
 * Undo Migrate
 *
 * @param {Object} knex
 * @param {Promise} Promise
 * @returns {Promise}
 */
exports.down = function (knex, Promise) {
	logger.info('[' + migrate_name + '] Migrating Down...');

	return knex.schema.table('redirection_host', (table) => {
		 table.dropColumn('forward_scheme');
	 })
	 .then(function () {
		logger.info('[' + migrate_name + '] redirection_host Table altered');
	 });

	logger.info('[' + migrate_name + '] Migrating Down Complete');

	return Promise.resolve(true);
};
