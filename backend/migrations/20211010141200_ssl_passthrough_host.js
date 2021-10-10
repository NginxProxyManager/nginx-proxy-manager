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
		table.string('forwarding_host').notNull();
		table.integer('forwarding_port').notNull().unsigned();
		table.integer('enabled').notNull().unsigned().defaultTo(1);
		table.json('meta').notNull();
	}).then(() => {
		logger.info('[' + migrate_name + '] Table created');
	})
	.then(() => {
		return knex.schema.table('user_permission', (table) => {
			table.string('ssl_passthrough_hosts').notNull();
	})
	.then(() => {
		return knex('user_permission').update('ssl_passthrough_hosts', knex.ref('streams'));
	})
	.then(() => {
		return knex.schema.alterTable('user_permission', (table) => {
				table.string('ssl_passthrough_hosts').notNullable().alter();
			});
	})
	.then(() => {
		logger.info('[' + migrate_name + '] permissions updated');
	});
	})
		;
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

	return knex.schema.dropTable('stream').then(() => {
		return knex.schema.table('user_permission', (table) => {
			table.dropColumn('ssl_passthrough_hosts');
		})
	})
		.then(function () {
			logger.info('[' + migrate_name + '] Table altered and permissions updated');
		});
};
