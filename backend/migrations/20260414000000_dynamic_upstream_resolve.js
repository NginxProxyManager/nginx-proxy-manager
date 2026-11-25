import { migrate as logger } from "../logger.js";

const migrateName = "dynamic_upstream_resolve";

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = (knex) => {
    logger.info(`[${migrateName}] Migrating Up...`);

    return knex.schema
        .alterTable('proxy_host', (table) => {
            table.tinyint('dynamic_upstream_resolve').notNullable().defaultTo(0);
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
const down = (knex) => {
    logger.info(`[${migrateName}] Migrating Down...`);

    return knex.schema
        .alterTable('proxy_host', (table) => {
            table.dropColumn('dynamic_upstream_resolve');
        })
        .then(() => {
            logger.info(`[${migrateName}] proxy_host Table altered`);
        });
};

export { up, down };
