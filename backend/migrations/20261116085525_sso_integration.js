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
	logger.info(`[${migrateName}] Removing existing tables...`);

	return knex.schema
		.dropTableIfExists("sso_client_openid")
		.then(() => knex.schema.dropTableIfExists("sso_client_github"))
		.then(() => knex.schema.dropTableIfExists("sso_client_auth0"))
		.then(() => knex.schema.dropTableIfExists("sso_auth"))
		.then(() => knex.schema.dropTableIfExists("sso_client"))

		.then(() => {
			logger.info(`[${migrateName}] Migrating Up...`);

			return knex.schema.createTable("sso_client", (table) => {
				table.increments().primary();
				table.dateTime("created_on").notNull();
				table.dateTime("modified_on").notNull();
				table.integer("owner_user_id").notNull().unsigned();
				table.tinyint("is_deleted").notNull().unsigned().defaultTo(0);
				table.tinyint("is_disabled").notNull().unsigned().defaultTo(0);
				table.string("client_type", 32).notNull();
				table.string("name", 64).notNull();
				table.tinyint("allow_internal").notNull().defaultTo(1);
				table.tinyint("allow_internal_if_admin").notNull().defaultTo(0);
				table.tinyint("require_group").notNull().defaultTo(0);
				table.string("require_group_name", 255).notNull().defaultTo("");
				table.tinyint("provision_users").notNull().defaultTo(0);
				table.tinyint("require_provision_group").notNull().defaultTo(0);
				table.string("require_provision_group_name", 255).notNull().defaultTo("");
				table.tinyint("require_verified_email").notNull().defaultTo(0);
				table.string("button_text", 64).notNull().defaultTo("");
				table.json("provision_role_map").notNull();
				table.json("meta").notNull();
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] sso_client Table created`);

			return knex.schema.createTable("sso_auth", (table) => {
				table.increments().primary();
				table.dateTime("created_on").notNull();
				table.dateTime("modified_on").notNull();
				table.integer("sso_client_id").notNull().unsigned();
				table.integer("user_id").notNull().unsigned();
				table.string("auth_type", 16).notNull();
				table.string("issuer", 512).notNull();
				table.string("subject", 512).notNull();
				table.string("audience", 512).notNull();
				table.string("claimed_email", 255).notNull();
				table.dateTime("first_login_at").notNull();
				table.dateTime("last_login_at").notNull();
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] sso_auth Table created`);

			return knex.schema.createTable("sso_client_openid", (table) => {
				table.increments().primary();
				table.integer("sso_client_id").notNull().unsigned();
				table.string("client_id", 512).notNull();
				table.string("client_secret", 2048).notNull();
				table.string("configuration_url", 512).notNull();
				table.string("redirect_url", 512).notNull();
				table.json("meta").notNull();
				table.index("sso_client_id");
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] sso_client_openid Table created`);

			return knex.schema.createTable("sso_client_auth0", (table) => {
				table.increments().primary();
				table.integer("sso_client_id").notNull().unsigned();
				table.string("client_id", 512).notNull();
				table.string("client_secret", 2048).notNull();
				table.string("domain", 512).notNull();
				table.string("redirect_url", 512).notNull();
				table.json("meta").notNull();
				table.index("sso_client_id");
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] sso_client_auth0 Table created`);

			return knex.schema.createTable("sso_client_github", (table) => {
				table.increments().primary();
				table.integer("sso_client_id").notNull().unsigned();
				table.string("github_client_id", 512).notNull();
				table.string("client_secret", 2048).notNull();
				table.string("redirect_url", 512).notNull();
				table.json("meta").notNull();
				table.index("sso_client_id");
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] sso_client_github Table created`);
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
			return knex.schema.dropTable("sso_client_auth0").then(() => {
				logger.info(`[${migrateName}] sso_client_auth0 Table dropped`);
			});
		})
		.then(() => {
			return knex.schema.dropTable("sso_client_github").then(() => {
				logger.info(`[${migrateName}] sso_client_github Table dropped`);
			});
		})
		.then(() => {
			return knex.schema.dropTable("sso_auth").then(() => {
				logger.info(`[${migrateName}] sso_auth Table dropped`);
			});
		})
		.then(() => {
			return knex.schema.dropTable("sso_client").then(() => {
				logger.info(`[${migrateName}] sso_client Table dropped`);
			});
		});
};

export { up, down };
