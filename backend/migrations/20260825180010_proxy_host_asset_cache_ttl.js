import { migrate as logger } from "../logger.js";

const migrateName = "proxy_host_asset_cache_ttl";

/**
 * @param {Object} knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema
		.alterTable("proxy_host", (table) => {
			table.integer("asset_cache_ttl").notNullable().unsigned().defaultTo(1800);
		})
		.then(() => {
			logger.info(`[${migrateName}] proxy_host Table altered`);
		});
};

/**
 * @param {Object} knex
 * @returns {Promise}
 */
const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	return knex.schema
		.alterTable("proxy_host", (table) => {
			table.dropColumn("asset_cache_ttl");
		})
		.then(() => {
			logger.info(`[${migrateName}] proxy_host Table altered`);
		});
};

export { up, down };
