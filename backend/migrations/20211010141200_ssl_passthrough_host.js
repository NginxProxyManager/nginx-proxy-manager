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
exports.up = async function (knex/*, Promise*/) {
	logger.info('[' + migrate_name + '] Migrating Up...');

	await knex.schema.createTable('ssl_passthrough_host', (table) => {
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
	});

	logger.info('[' + migrate_name + '] Table created');

	// Remove unique constraint so name can be used for new table
	await knex.schema.alterTable('user_permission', (table) => {
		table.dropUnique('user_id');
	});

	await knex.schema.renameTable('user_permission', 'user_permission_old');

	// We need to recreate the table since sqlite does not support altering columns
	await knex.schema.createTable('user_permission', (table) => {
		table.increments().primary();
		table.dateTime('created_on').notNull();
		table.dateTime('modified_on').notNull();
		table.integer('user_id').notNull().unsigned();
		table.string('visibility').notNull();
		table.string('proxy_hosts').notNull();
		table.string('redirection_hosts').notNull();
		table.string('dead_hosts').notNull();
		table.string('streams').notNull();
		table.string('ssl_passthrough_hosts').notNull();
		table.string('access_lists').notNull();
		table.string('certificates').notNull();
		table.unique('user_id');
	});

	await knex('user_permission_old').select('*', 'streams as ssl_passthrough_hosts').then((data) => {
		if (data.length) {
			return knex('user_permission').insert(data);
		}
		return Promise.resolve();
	});

	await knex.schema.dropTableIfExists('user_permission_old');

	logger.info('[' + migrate_name + '] permissions updated');
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
		});
	})
		.then(function () {
			logger.info('[' + migrate_name + '] Table altered and permissions updated');
		});
};
