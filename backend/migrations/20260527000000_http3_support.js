import { migrate as logger } from "../logger.js";

const migrateName = "http3_support";

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
            // tinyint(1) matches the convention used by the other boolean flags
            // in this table (ssl_forced, http2_support, hsts_enabled, etc.)
            table.tinyint('http3_support').notNullable().defaultTo(0);
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
const down = async (knex) => {
    logger.info(`[${migrateName}] Migrating Down...`);

    // Defensively zero-out all rows first so that any templates evaluated during
    // a lag between column removal and nginx reload will see a safe falsy value.
    await knex('proxy_host').update({ http3_support: 0 });

    return knex.schema
        .alterTable('proxy_host', (table) => {
            table.dropColumn('http3_support');
        })
        .then(() => {
            logger.info(`[${migrateName}] proxy_host Table altered`);
        });
};

export { up, down };
