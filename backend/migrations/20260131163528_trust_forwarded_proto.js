import { migrate as logger } from "../logger.js";

const migrateName = "redirect_auto_scheme";

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = function (knex) {
    return knex.schema.alterTable('proxy_host', (table) => {
        table.tinyint('trust_forwarded_proto').notNullable().defaultTo(0);
    });
};

/**
 * Undo Migrate
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const down = function (knex) {
    return knex.schema.alterTable('proxy_host', (table) => {
        table.dropColumn('trust_forwarded_proto');
    });
};

export { up, down };