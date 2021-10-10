const migrate_name = 'ssl_passthrough_host';
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

	return knex.schema.createTable('ssl_passthrough_host', (table) => {
		table.increments().primary();
		table.dateTime('created_on').notNull();
		table.dateTime('modified_on').notNull();
		table.integer('owner_user_id').notNull().unsigned();
		table.integer('is_deleted').notNull().unsigned().defaultTo(0);
		table.string('domain_name').notNull();
		table.string('forward_ip').notNull();
		table.integer('forwarding_port').notNull().unsigned();
		table.json('meta').notNull();
	})
		.then(() => {
			logger.info('[' + migrate_name + '] Table created');
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

	return knex.schema.dropTable('stream')
		.then(function () {
			logger.info('[' + migrate_name + '] Table altered');
		});
};
