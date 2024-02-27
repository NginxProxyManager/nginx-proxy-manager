const migrate_name = 'identifier_for_migrate';
const logger       = require('../logger').migrate;

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param {Object} knex
 * @param {Promise} Promise
 * @returns {Promise}
 */
exports.up = function (knex, Promise) {
    logger.info('[' + migrate_name + '] Migrating Up...');

    return knex.schema.table('stream', (table) => {
        table.renameColumn('forwarding_host', 'forwarding_hosts');
    })
        .then(function () {
            logger.info('[' + migrate_name + '] stream Table altered');
        });
};

/**
 * Undo Migrate
 *
 * @param {Object} knex
 * @param {Promise} Promise
 * @returns {Promise}
 */
exports.down = function (knex, Promise) {
    logger.info('[' + migrate_name + '] Migrating Down...');

    return knex.schema.table('stream', (table) => {
        table.renameColumn('forwarding_hosts', 'forwarding_host');
    })
        .then(function () {
            logger.info('[' + migrate_name + '] stream Table altered');
        });
};
