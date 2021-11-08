const migrate_name  = 'stream_domain';
const logger        = require('../logger').migrate;
const internalNginx = require('../internal/nginx');

async function regenerateDefaultHost(knex) {
	const row = await knex('setting').select('*').where('id', 'default-site').first();

	return internalNginx.deleteConfig('default')
		.then(() => {
			return internalNginx.generateConfig('default', row);
		})
		.then(() => {
			return internalNginx.test();
		})
		.then(() => {
			return internalNginx.reload();
		});
}

/**
	* Migrate
	*
	* @see http://knexjs.org/#Schema
	*
	* @param   {Object} knex
	* @param   {Promise} Promise
	* @returns {Promise}
	*/
exports.up = function (knex) {
	logger.info('[' + migrate_name + '] Migrating Up...');

	return regenerateDefaultHost(knex);
};

/**
	* Undo Migrate
	*
	* @param   {Object} knex
	* @param   {Promise} Promise
	* @returns {Promise}
	*/
exports.down = function (knex) {
	logger.info('[' + migrate_name + '] Migrating Down...');

	return regenerateDefaultHost(knex);
};