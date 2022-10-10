const migrate_name = 'stream_proxy_protocol';
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
	knex.schema.table('stream', function (stream) {
		stream.dropColumn('stream_access_proxy_protocol');
	})
		.then(() => {
			logger.info('[' + migrate_name + '] stream Table altered - ERRANT Column fixed!');
		}).catch((err) => {
			logger.error('[' + migrate_name + '] stream Table error while removing errant column: ' + err);
		});

	logger.info('[' + migrate_name + '] Migrating PROXY_HOST Table Up...');
	knex.schema.table('proxy_host', function (proxy_host) {
		proxy_host.integer('enable_proxy_protocol').notNull().unsigned().defaultTo(0);
	})
		.then(() => {
			logger.info('[' + migrate_name + '] proxy_host Table altered - "enable_proxy_protocol" added');
		}).catch((err) => {
			logger.error('[' + migrate_name + '] proxy_host Table error migrating up: ' + err);
		});
	knex.schema.table('proxy_host', function (proxy_host) {
		proxy_host.string('load_balancer_ip').notNull().defaultTo('');
	})
		.then(() => {
			logger.info('[' + migrate_name + '] proxy_host Table altered - "load_balancer_ip" added');
		}).catch((err) => {
			logger.error('[' + migrate_name + '] proxy_host Table error migrating up: ' + err);
		});

	logger.info('[' + migrate_name + '] Migrating STREAM Table Up...');
	knex.schema.table('stream', function (stream) {
		stream.integer('stream_allow_proxy_protocol').notNull().unsigned().defaultTo(0);
	})
		.then(() => {
			logger.info('[' + migrate_name + '] stream Table altered - PROXY protocol added');
		}).catch((err) => {
			logger.error('[' + migrate_name + '] stream Table error migrating up: ' + err);
		});
	knex.schema.table('stream', function (stream) {
		stream.integer('stream_enable_proxy_protocol').notNull().unsigned().defaultTo(0);
	})
		.then(() => {
			logger.info('[' + migrate_name + '] stream Table altered - PROXY protocol added');
		}).catch((err) => {
			logger.error('[' + migrate_name + '] stream Table error migrating up: ' + err);
		});
	knex.schema.table('stream', function (stream) {
		stream.integer('stream_load_balancer_ip').notNull().unsigned().defaultTo('');
	})
		.then(() => {
			logger.info('[' + migrate_name + '] stream Table altered - PROXY protocol added');
		}).catch((err) => {
			logger.error('[' + migrate_name + '] stream Table error migrating up: ' + err);
		});
	return Promise.resolve(true);
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