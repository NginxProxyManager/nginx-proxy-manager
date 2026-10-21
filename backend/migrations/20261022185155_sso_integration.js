import { migrate as logger } from "../logger.js";

const migrateName = "sso-integration";

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
		.createTable("sso_client", (table) => {
			table.increments().primary();
			table.dateTime("created_on").notNull();
			table.dateTime("modified_on").notNull();
			table.integer("owner_user_id").notNull().unsigned();
			table.integer("is_deleted").notNull().unsigned().defaultTo(0);
			table.string("client_type").notNull();
			table.string("name").notNull();
			table.boolean("enabled").notNull();
			table.json("meta").notNull();
		})
		.then(() => {
			logger.info(`[${migrateName}] sso_client Table created`);

			return knex.schema.createTable("sso_client_openid", (table) => {
				table.increments().primary();
				table.integer("sso_client_id").notNull().unsigned();
				table.string("client_id").notNull();
				table.string("client_secret").notNull();
				table.string("configuration_url").notNull();
				table.string("redirect_url").notNull();
				table.json("meta").notNull();
				table.index("sso_client_id");
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] sso_client_openid Table created`);

			return knex.schema.createTable("sso_client_saml", (table) => {
				table.increments().primary();
				table.integer("sso_client_id").notNull().unsigned();
				table.string("saml_endpoint").notNull();
				table.json("meta").notNull();
				table.index("sso_client_id");
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] sso_client_saml Table created`);
		});
};

/**
 * Undo Migrate
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	return knex.schema
		.dropTable("sso_client_openid")
		.then(() => {
			logger.info(`[${migrateName}] sso_client_openid Table dropped`);
		})
		.then(() => {
			return knex.schema.dropTable("sso_client_saml").then(() => {
				logger.info(`[${migrateName}] sso_client_saml Table dropped`);
			});
		})
		.then(() => {
			return knex.schema.dropTable("sso_client").then(() => {
				logger.info(`[${migrateName}] sso_client Table dropped`);
			});
		});
};

export { up, down };
