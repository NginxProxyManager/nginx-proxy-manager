const migrate_name = 'upstreams';
const logger = require('../logger').migrate;

/**
 * Migrate
 * @see http://knexjs.org/#Schema
 * @param {Object} knex
 * @param {Promise} Promise
 * @returns {Promise}
 */
exports.up = function (knex) {
	logger.info('[' + migrate_name + '] Migrating Up...');

	return knex.schema.createTable('upstream', (table) => {
		table.increments().primary();
		table.dateTime('created_on').notNull();
		table.dateTime('modified_on').notNull();
		table.integer('owner_user_id').notNull().unsigned();
		table.integer('is_deleted').notNull().unsigned().defaultTo(0);
		table.string('name').notNull();
		table.string('scheme').notNull().defaultTo('http');
		table.json('servers').notNull();
		table.json('meta').notNull();
	})
	.then(() => {
		logger.info('[' + migrate_name + '] upstream Table created');
		return knex.schema.table('proxy_host', (table) => {
			table.string('forward_host').nullable().alter();
			table.integer('forward_port').nullable().alter();
			table.integer('upstream_id').notNull().unsigned().defaultTo(0);
		});
	})
	.then(() => {
		logger.info('[' + migrate_name + '] proxy_host Table altered');
		return knex.schema.table('user_permission', (table) => {
			table.string('upstreams').notNull().defaultTo('hidden');
		});
	})
	.then(() => {
		logger.info('[' + migrate_name + '] user_permission Table altered');
	});
};

/**
 * Undo Migrate
 * @param {Object} knex
 * @param {Promise} Promise
 * @returns {Promise}
 */
exports.down = function (knex) {
	logger.info('[' + migrate_name + '] Migrating Down...');

	return knex.schema.dropTable('upstream')
		.then(() => {
			logger.info('[' + migrate_name + '] upstream Table dropped');
			return knex.schema.table('proxy_host', (table) => {
				table.string('forward_host').notNullable().alter();
				table.integer('forward_port').notNullable().alter();
				table.dropColumn('upstream_id');
			});
		})
		.then(() => {
			logger.info('[' + migrate_name + '] proxy_host Table altered');
			return knex.schema.table('user_permission', (table) => {
				table.dropColumn('upstreams');
			});
		})
		.then(() => {
			logger.info('[' + migrate_name + '] user_permission Table altered');
		});
};