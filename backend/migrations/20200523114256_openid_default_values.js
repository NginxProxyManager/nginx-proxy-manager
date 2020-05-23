const migrate_name = 'openid_default_values';
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

	return knex.schema.raw('ALTER TABLE proxy_host ALTER openidc_redirect_uri SET DEFAULT \'\'')
		.then(() => knex.schema.raw('ALTER TABLE proxy_host ALTER openidc_discovery SET DEFAULT \'\''))
		.then(() => knex.schema.raw('ALTER TABLE proxy_host ALTER openidc_auth_method SET DEFAULT \'client_secret_post\''))
		.then(() => knex.schema.raw('ALTER TABLE proxy_host ALTER openidc_client_id SET DEFAULT \'\''))
		.then(() => knex.schema.raw('ALTER TABLE proxy_host ALTER openidc_client_secret SET DEFAULT \'\''))
		.then(() => {
			logger.info('[' + migrate_name + '] proxy_host Table altered');
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
	logger.warn('[' + migrate_name + '] You can\'t migrate down this one.');
	return Promise.resolve(true);
};
