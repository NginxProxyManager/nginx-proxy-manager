import { migrate as logger } from "../logger.js";

const migrateName = "proxy_host_gzip";

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
		})
		.then(() => {
			logger.info(`[${migrateName}] proxy_host Table altered`);
		});
};

export { up, down };
