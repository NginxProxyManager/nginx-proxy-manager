import { migrate as logger } from "../logger.js";

const migrateName = "proxy_host_http3";

/**
 * @param {Object} knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema
		.alterTable("proxy_host", (table) => {
			table.tinyint("http3_support").notNullable().defaultTo(0);
		})
		.then(() => {
			return knex.schema.createTable("resource_lock", (table) => {
				table.string("name", 64).notNullable().primary();
				table.bigInteger("version").notNullable().defaultTo(0);
				table.string("mode", 32).nullable();
			});
		})
		.then(async () => {
			const udpStream = await knex("stream")
				.select("id")
				.where("is_deleted", 0)
				.andWhere("enabled", 1)
				.andWhere("incoming_port", 443)
				.andWhere("udp_forwarding", 1)
				.first();
			return knex("resource_lock").insert({
				name: "udp-443",
				version: 0,
				mode: udpStream ? "udp_stream" : null,
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] proxy_host and resource_lock Tables altered`);
		});
};

/**
 * @param {Object} knex
 * @returns {Promise}
 */
const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	return knex.schema
		.dropTable("resource_lock")
		.then(() =>
			knex.schema.alterTable("proxy_host", (table) => {
				table.dropColumn("http3_support");
			}),
		)
		.then(() => {
			logger.info(`[${migrateName}] proxy_host and resource_lock Tables altered`);
		});
};

export { up, down };
