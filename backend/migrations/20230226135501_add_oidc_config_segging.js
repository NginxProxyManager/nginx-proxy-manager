const migrate_name  = 'oidc_config_setting';
const logger        = require('../logger').migrate;
const settingModel  = require('../models/setting');

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

	return settingModel
		.query()
		.insert({
			id:          'oidc-config',
			name:        'Open ID Connect',
			description: 'Sign in to Nginx Proxy Manager with an external Identity Provider',
			value:       'metadata',
			meta:        {},
		});
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

	return settingModel
		.query()
		.delete()
		.where('setting_id', 'oidc-config');
};