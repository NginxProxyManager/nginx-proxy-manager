import { migrate as logger } from "../logger.js";

const migrateName = "upstream_hosts";

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema
		.createTable("upstream_host", (table) => {
			table.increments().primary();
			table.dateTime("created_on").notNull();
			table.dateTime("modified_on").notNull();
			table.integer("owner_user_id").notNull().unsigned();
			table.integer("is_deleted").notNull().unsigned().defaultTo(0);
			table.string("name", 255).notNull();
			table.string("forward_scheme", 10).notNull().defaultTo("http");
			table.string("method", 32).notNull().defaultTo("round_robin");
			table.json("meta").notNull();
		})
		.then(() => {
			logger.info(`[${migrateName}] upstream_host Table created`);

			return knex.schema.createTable("upstream_host_server", (table) => {
				table.increments().primary();
				table.dateTime("created_on").notNull();
				table.dateTime("modified_on").notNull();
				table.integer("upstream_host_id").notNull().unsigned();
				table.string("host", 255).notNull();
				table.integer("port").notNull().unsigned();
				table.integer("weight").nullable().unsigned();
				table.json("meta").notNull();
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] upstream_host_server Table created`);

			return knex.schema.table("proxy_host", (proxy_host) => {
				proxy_host.integer("upstream_host_id").notNull().unsigned().defaultTo(0);
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] proxy_host Table altered`);

			return knex.schema.table("user_permission", (user_permission) => {
				user_permission.string("upstream_hosts").notNull().defaultTo("manage");
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] user_permission Table altered`);
		});
};

/**
 * Undo Migrate
 *
 * @param {Object} knex
 * @returns {Promise}
 */
const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	return knex.schema
		.dropTable("upstream_host_server")
		.then(() => {
			logger.info(`[${migrateName}] upstream_host_server Table dropped`);

			return knex.schema.dropTable("upstream_host");
		})
		.then(() => {
			logger.info(`[${migrateName}] upstream_host Table dropped`);

			return knex.schema.table("proxy_host", (proxy_host) => {
				proxy_host.dropColumn("upstream_host_id");
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] proxy_host Table reverted`);

			return knex.schema.table("user_permission", (user_permission) => {
				user_permission.dropColumn("upstream_hosts");
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] user_permission Table reverted`);
		});
};

export { up, down };
