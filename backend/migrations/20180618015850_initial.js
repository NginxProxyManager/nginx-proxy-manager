const migrate_name = 'initial-schema';
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

	return knex.schema.createTable('auth', (table) => {
		table.increments().primary();
		table.dateTime('created_on').notNull();
		table.dateTime('modified_on').notNull();
		table.integer('user_id').notNull().unsigned();
		table.string('type', 30).notNull();
		table.string('secret').notNull();
		table.json('meta').notNull();
		table.integer('is_deleted').notNull().unsigned().defaultTo(0);
	})
		.then(() => {
			logger.info('[' + migrate_name + '] auth Table created');

			return knex.schema.createTable('user', (table) => {
				table.increments().primary();
				table.dateTime('created_on').notNull();
				table.dateTime('modified_on').notNull();
				table.integer('is_deleted').notNull().unsigned().defaultTo(0);
				table.integer('is_disabled').notNull().unsigned().defaultTo(0);
				table.string('email').notNull();
				table.string('name').notNull();
				table.string('nickname').notNull();
				table.string('avatar').notNull();
				table.json('roles').notNull();
			});
		})
		.then(() => {
			logger.info('[' + migrate_name + '] user Table created');

			return knex.schema.createTable('user_permission', (table) => {
				table.increments().primary();
				table.dateTime('created_on').notNull();
				table.dateTime('modified_on').notNull();
				table.integer('user_id').notNull().unsigned();
				table.string('visibility').notNull();
				table.string('proxy_hosts').notNull();
				table.string('redirection_hosts').notNull();
				table.string('dead_hosts').notNull();
				table.string('streams').notNull();
				table.string('access_lists').notNull();
				table.string('certificates').notNull();
				table.unique('user_id');
			});
		})
		.then(() => {
			logger.info('[' + migrate_name + '] user_permission Table created');

			return knex.schema.createTable('proxy_host', (table) => {
				table.increments().primary();
				table.dateTime('created_on').notNull();
				table.dateTime('modified_on').notNull();
				table.integer('owner_user_id').notNull().unsigned();
				table.integer('is_deleted').notNull().unsigned().defaultTo(0);
				table.json('domain_names').notNull();
				table.string('forward_ip').notNull();
				table.integer('forward_port').notNull().unsigned();
				table.integer('access_list_id').notNull().unsigned().defaultTo(0);
				table.integer('certificate_id').notNull().unsigned().defaultTo(0);
				table.integer('ssl_forced').notNull().unsigned().defaultTo(0);
				table.integer('caching_enabled').notNull().unsigned().defaultTo(0);
				table.integer('block_exploits').notNull().unsigned().defaultTo(0);
				table.text('advanced_config').notNull().defaultTo('');
				table.json('meta').notNull();
			});
		})
		.then(() => {
			logger.info('[' + migrate_name + '] proxy_host Table created');

			return knex.schema.createTable('redirection_host', (table) => {
				table.increments().primary();
				table.dateTime('created_on').notNull();
				table.dateTime('modified_on').notNull();
				table.integer('owner_user_id').notNull().unsigned();
				table.integer('is_deleted').notNull().unsigned().defaultTo(0);
				table.json('domain_names').notNull();
				table.string('forward_domain_name').notNull();
				table.integer('preserve_path').notNull().unsigned().defaultTo(0);
				table.integer('certificate_id').notNull().unsigned().defaultTo(0);
				table.integer('ssl_forced').notNull().unsigned().defaultTo(0);
				table.integer('block_exploits').notNull().unsigned().defaultTo(0);
				table.text('advanced_config').notNull().defaultTo('');
				table.json('meta').notNull();
			});
		})
		.then(() => {
			logger.info('[' + migrate_name + '] redirection_host Table created');

			return knex.schema.createTable('dead_host', (table) => {
				table.increments().primary();
				table.dateTime('created_on').notNull();
				table.dateTime('modified_on').notNull();
				table.integer('owner_user_id').notNull().unsigned();
				table.integer('is_deleted').notNull().unsigned().defaultTo(0);
				table.json('domain_names').notNull();
				table.integer('certificate_id').notNull().unsigned().defaultTo(0);
				table.integer('ssl_forced').notNull().unsigned().defaultTo(0);
				table.text('advanced_config').notNull().defaultTo('');
				table.json('meta').notNull();
			});
		})
		.then(() => {
			logger.info('[' + migrate_name + '] dead_host Table created');

			return knex.schema.createTable('stream', (table) => {
				table.increments().primary();
				table.dateTime('created_on').notNull();
				table.dateTime('modified_on').notNull();
				table.integer('owner_user_id').notNull().unsigned();
				table.integer('is_deleted').notNull().unsigned().defaultTo(0);
				table.integer('incoming_port').notNull().unsigned();
				table.string('forward_ip').notNull();
				table.integer('forwarding_port').notNull().unsigned();
				table.integer('tcp_forwarding').notNull().unsigned().defaultTo(0);
				table.integer('udp_forwarding').notNull().unsigned().defaultTo(0);
				table.json('meta').notNull();
			});
		})
		.then(() => {
			logger.info('[' + migrate_name + '] stream Table created');

			return knex.schema.createTable('access_list', (table) => {
				table.increments().primary();
				table.dateTime('created_on').notNull();
				table.dateTime('modified_on').notNull();
				table.integer('owner_user_id').notNull().unsigned();
				table.integer('is_deleted').notNull().unsigned().defaultTo(0);
				table.string('name').notNull();
				table.json('meta').notNull();
			});
		})
		.then(() => {
			logger.info('[' + migrate_name + '] access_list Table created');

			return knex.schema.createTable('certificate', (table) => {
				table.increments().primary();
				table.dateTime('created_on').notNull();
				table.dateTime('modified_on').notNull();
				table.integer('owner_user_id').notNull().unsigned();
				table.integer('is_deleted').notNull().unsigned().defaultTo(0);
				table.string('provider').notNull();
				table.string('nice_name').notNull().defaultTo('');
				table.json('domain_names').notNull();
				table.dateTime('expires_on').notNull();
				table.json('meta').notNull();
			});
		})
		.then(() => {
			logger.info('[' + migrate_name + '] certificate Table created');

			return knex.schema.createTable('access_list_auth', (table) => {
				table.increments().primary();
				table.dateTime('created_on').notNull();
				table.dateTime('modified_on').notNull();
				table.integer('access_list_id').notNull().unsigned();
				table.string('username').notNull();
				table.string('password').notNull();
				table.json('meta').notNull();
			});
		})
		.then(() => {
			logger.info('[' + migrate_name + '] access_list_auth Table created');

			return knex.schema.createTable('audit_log', (table) => {
				table.increments().primary();
				table.dateTime('created_on').notNull();
				table.dateTime('modified_on').notNull();
				table.integer('user_id').notNull().unsigned();
				table.string('object_type').notNull().defaultTo('');
				table.integer('object_id').notNull().unsigned().defaultTo(0);
				table.string('action').notNull();
				table.json('meta').notNull();
			});
		})
		.then(() => {
			logger.info('[' + migrate_name + '] audit_log Table created');
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
