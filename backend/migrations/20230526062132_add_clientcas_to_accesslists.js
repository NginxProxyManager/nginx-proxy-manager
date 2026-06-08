import { migrate as logger } from "../logger.js";

const migrateName = "client_certificates";

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param {Object} knex
 * @param {Promise} Promise
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema.createTable("access_list_clientcas", (table) => {
		table.increments().primary();
		table.dateTime("created_on").notNull();
		table.dateTime("modified_on").notNull();
		table.integer("access_list_id").notNull().unsigned();
		table.integer("certificate_id").notNull().unsigned();
		table.json("meta").notNull();
	})
		.then(() => {
			logger.info(`[${migrateName}] access_list_clientcas Table created`);
		})
		.then(() => {
			logger.info(`[${migrateName}] Migrating Up Complete`);
		});
};

/**
 * Undo Migrate
 *
 * @param {Object} knex
 * @param {Promise} Promise
 * @returns {Promise}
 */
const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	return knex.schema.dropTable("access_list_clientcas")
		.then(() => {
			logger.info(`[${migrateName}] access_list_clientcas Table dropped`);
		})
		.then(() => {
			logger.info(`[${migrateName}] Migrating Down Complete`);
		});
};

export { up, down };
