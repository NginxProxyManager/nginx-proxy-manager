import { migrate as logger } from "../logger.js";

const migrateName = "proxy_host_performance";

/**
 * @param {Object} knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema
		.alterTable("proxy_host", (table) => {
			table.tinyint("gzip_enabled").notNullable().defaultTo(1);
			table.integer("gzip_comp_level").notNullable().unsigned().defaultTo(1);
			table.json("gzip_types").nullable();
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
			table.dropColumn("gzip_enabled");
			table.dropColumn("gzip_comp_level");
			table.dropColumn("gzip_types");
			table.dropColumn("asset_cache_ttl");
		})
		.then(() => {
			logger.info(`[${migrateName}] proxy_host Table altered`);
		});
};

export { up, down };
