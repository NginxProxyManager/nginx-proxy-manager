import { migrate as logger } from "../logger.js";

const migrateName = "access_list_client";

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
		.createTable("access_list_client", (table) => {
			table.increments().primary();
			table.dateTime("created_on").notNull();
			table.dateTime("modified_on").notNull();
			table.integer("access_list_id").notNull().unsigned();
			table.string("address").notNull();
			table.string("directive").notNull();
			table.json("meta").notNull();
		})
		.then(() => {
			logger.info(`[${migrateName}] access_list_client Table created`);

			return knex.schema.table("access_list", (access_list) => {
				access_list.integer("satify_any").notNull().defaultTo(0);
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] access_list Table altered`);
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

	return knex.schema.dropTable("access_list_client").then(() => {
		logger.info(`[${migrateName}] access_list_client Table dropped`);
	});
};

export { up, down };
