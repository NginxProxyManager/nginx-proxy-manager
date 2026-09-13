const migrate_name = "proxy_protocol_stream";
import { migrate as logger } from "../logger.js";

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const up = (knex) => {
    logger.info(`[${migrate_name}] Migrating Up...`);

    return knex.schema.table("stream", (table) => {
        table.integer("enable_proxy_protocol").notNull().unsigned().defaultTo(0);
    }).then(() => {
        logger.info(`[${migrate_name}] stream Table altered`);
    });

};

/**
 * Undo Migrate
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const down = (knex) => {
    logger.info(`[${migrate_name}] Migrating Down...`);

    return knex.schema.table("stream", (table) => {
        table.dropColumn("enable_proxy_protocol");
    })
    .then(() => {
        logger.info(`[${migrate_name}] stream Table altered`);
    });
};

export { up, down };
