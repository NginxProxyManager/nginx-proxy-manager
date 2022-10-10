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
	logger.info('[' + migrate_name + '] Migrating Up...');
	let ret = knex.schema.table('stream', function (stream) {
		stream.integer('stream_enable_proxy_protocol').notNull().unsigned().defaultTo(0);
		stream.integer('stream_access_proxy_protocol').notNull().unsigned().defaultTo(0);
		stream.string('stream_load_balancer_ip').notNull().defaultTo('');
	})
		.then(() => {
			logger.info('[' + migrate_name + '] stream Table altered - PROXY protocol added');
		}).catch((err) => {
			logger.error('[' + migrate_name + '] Error migrating up: ' + err);
		});
	if (!ret) {
		logger.error('[' + migrate_name + '] ERROR MIGRATING UP');
	}
};

/**
 * Undo Migrate
 *
 * @param   {Object}  knex
 * @param   {Promise} Promise
 * @returns {Promise}
 */
exports.down = function (knex/*, Promise*/) {
	return knex.schema.table('stream', (stream) => {
		stream.dropColumn('stream_enable_proxy_protocol');
		stream.dropColumn('stream_access_proxy_protocol');
		stream.dropColumn('stream_load_balancer_ip');
	})
		.then(function () {
			logger.info('[' + migrate_name + '] MIGRATING DOWN stream Table altered - PROXY protocol removed');
		});

	// logger.warn('[' + migrate_name + '] You can\'t migrate down this one.');
	// return Promise.resolve(true);
};