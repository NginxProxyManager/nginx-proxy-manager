import { migrate as logger } from "../logger.js";

const migrateName = "use_http_host";

const up = (knex) => {
    logger.info(`[${migrateName}] Migrating Up...`);
    return knex.schema
        .alterTable("proxy_host", (table) => {
            table.tinyint("use_http_host").notNullable().defaultTo(0);
        })
        .then(() => {
            logger.info(`[${migrateName}] proxy_host Table altered`);
        });
};

const down = (knex) => {
    logger.info(`[${migrateName}] Migrating Down...`);
    return knex.schema
        .alterTable("proxy_host", (table) => {
            table.dropColumn("use_http_host");
        })
        .then(() => {
            logger.info(`[${migrateName}] proxy_host Table altered`);
        });
};

export { up, down };
