const migrate_name = 'settings';
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

	return knex.schema.createTable('setting', (table) => {
		table.string('id').notNull().primary();
		table.string('name', 100).notNull();
		table.string('description', 255).notNull();
		table.string('value', 255).notNull();
		table.json('meta').notNull();
	})
		.then(() => {
			logger.info('[' + migrate_name + '] setting Table created');
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
	logger.warn('[' + migrate_name + '] You can\'t migrate down the initial data.');
	return Promise.resolve(true);
};
