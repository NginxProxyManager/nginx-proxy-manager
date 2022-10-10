const migrate_name = 'proxy_protocol';
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
	let ret = knex.schema.table('proxy_host', function (proxy_host) {
		proxy_host.integer('enable_proxy_protocol').notNull().unsigned().defaultTo(0);
		proxy_host.string('load_balancer_ip').notNull().defaultTo('');
	})
		.then(() => {
			logger.info('[' + migrate_name + '] proxy_host Table altered - PROXY protocol added');
		}).catch((err) => {
			logger.error('[' + migrate_name + '] Error migrating up: ' + err);
			ret = Promise.resolve(true);
		});
	if (!ret) {
		logger.error('[' + migrate_name + '] ERROR MIGRATING UP');
		ret = Promise.resolve(true);
	}
	return ret;
};

/**
 * Undo Migrate
 *
 * @param   {Object}  knex
 * @param   {Promise} Promise
 * @returns {Promise}
 */
exports.down = function (knex/*, Promise*/) {
	return knex.schema.table('proxy_host', (proxy_host) => {
		proxy_host.dropColumn('enable_proxy_protocol');
		proxy_host.dropColumn('load_balancer_ip');
	})
		.then(function () {
			logger.info('[' + migrate_name + '] MIGRATING DOWN proxy_host Table altered - PROXY protocol removed');
		});

	// logger.warn('[' + migrate_name + '] You can\'t migrate down this one.');
	// return Promise.resolve(true);
};
