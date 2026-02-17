import { migrate as logger } from "../logger.js";

const migrateName = "trust_forwarded_proto";

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = function (knex) {
    logger.info(`[${migrateName}] Migrating Up...`);

    return knex.schema
        .alterTable('proxy_host', (table) => {
            table.tinyint('trust_forwarded_proto').notNullable().defaultTo(0);
        })
        .then(() => {
            logger.info(`[${migrateName}] proxy_host Table altered`);
        });
};

/**
 * Undo Migrate
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const down = function (knex) {
    logger.info(`[${migrateName}] Migrating Down...`);

    return knex.schema
        .alterTable('proxy_host', (table) => {
            table.dropColumn('trust_forwarded_proto');
        })
        .then(() => {
            logger.info(`[${migrateName}] proxy_host Table altered`);
        });
};

export { up, down };