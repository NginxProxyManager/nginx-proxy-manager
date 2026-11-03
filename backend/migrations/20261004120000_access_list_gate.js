import { migrate as logger } from "../logger.js";

const migrateName = "access_list_gate";

/**
 * Migrate
 *
 * Adds security keys and header tokens to access lists
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema
		.alterTable("access_list", (table) => {
			table.tinyint("key_auth").notNullable().defaultTo(0);
			table.integer("key_session_hours").notNullable().unsigned().defaultTo(168);
		})
		.then(() => {
			logger.info(`[${migrateName}] access_list Table altered`);

			return knex.schema.createTable("access_list_key", (table) => {
				table.increments().primary();
				table.dateTime("created_on").notNull();
				table.dateTime("modified_on").notNull();
				table.integer("access_list_id").notNull().unsigned();
				table.string("name").notNull();
				table.string("rp_id").notNull();
				table.text("credential_id").notNull();
				table.text("public_key").notNull();
				table.bigInteger("counter").notNull().unsigned().defaultTo(0);
				table.json("transports").notNull();
				table.string("invite_nonce").notNull().unique();
				table.dateTime("last_used_on").nullable();
				table.json("meta").notNull();
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] access_list_key Table created`);

			return knex.schema.createTable("access_list_token", (table) => {
				table.increments().primary();
				table.dateTime("created_on").notNull();
				table.dateTime("modified_on").notNull();
				table.integer("access_list_id").notNull().unsigned();
				table.string("name").notNull();
				table.string("header_name", 64).notNull();
				table.string("token_hash", 64).notNull();
				table.tinyint("forward").notNull().defaultTo(1);
				table.dateTime("last_used_on").nullable();
				table.json("meta").notNull();
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] access_list_token Table created`);
		});
};

/**
 * Undo Migrate
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	return knex.schema
		.dropTable("access_list_token")
		.then(() => knex.schema.dropTable("access_list_key"))
		.then(() =>
			knex.schema.alterTable("access_list", (table) => {
				table.dropColumn("key_auth");
				table.dropColumn("key_session_hours");
			}),
		)
		.then(() => {
			logger.info(`[${migrateName}] Migrating Down Complete`);
		});
};

export { up, down };
