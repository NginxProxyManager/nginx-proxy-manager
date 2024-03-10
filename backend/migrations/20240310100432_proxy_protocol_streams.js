const migrate_name = 'proxy_protocol_streams';
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

	return knex.schema.table('stream', function (stream) {
		stream.integer('enable_proxy_protocol').notNull().unsigned().defaultTo(0);
		stream.string('load_balancer_ip').notNull().defaultTo('');
	})
		.then(() => {
			logger.info('[' + migrate_name + '] stream Table altered');
		});

};

/**
 * Undo Migrate
 *
 * @param   {Object}  knex
 * @param   {Promise} Promise
 * @returns {Promise}
 */
exports.down = function (knex/*, Promise*/) {
	return knex.schema.table('stream', function (stream) {
		stream.dropColumn('enable_proxy_protocol');
		stream.dropColumn('load_balancer_ip');
	})
		.then(function () {
			logger.info('[' + migrate_name + '] stream Table altered');
		});
};