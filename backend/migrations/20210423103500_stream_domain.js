const migrate_name = 'stream_domain';
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
exports.up = function (knex/*, Promise*/) {
	logger.info('[' + migrate_name + '] Migrating Up...');

	return knex.schema.table('stream', (table) => {
		table.renameColumn('forward_ip', 'forwarding_host');
	})
		.then(function () {
			logger.info('[' + migrate_name + '] stream Table altered');
		});
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

	return knex.schema.table('stream', (table) => {
		table.renameColumn('forwarding_host', 'forward_ip');
	})
		.then(function () {
			logger.info('[' + migrate_name + '] stream Table altered');
		});
};
