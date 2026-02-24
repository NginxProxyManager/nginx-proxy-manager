import { migrate as logger } from "../logger.js";

const migrateName = "ldap_config";

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
		.createTable("ldap_config", (table) => {
			table.increments().primary();
			table.string("server_url").notNull();
			table.string("bind_dn").nullable();
			table.string("bind_password").nullable();
			table.string("search_base").notNull();
			table.string("user_filter").nullable();
			table.string("group_dn").nullable();
			table.string("user_attribute").notNull().defaultTo("uid");
			table.string("admin_group").nullable();
			table.string("user_group").nullable();
			table.boolean("enabled").notNull().defaultTo(false);
			table.boolean("tls_verify").notNull().defaultTo(true);
			table.boolean("starttls").notNull().defaultTo(false);
			table.dateTime("created_on").notNull();
			table.dateTime("modified_on").notNull();
		})
		.then(() => {
			logger.info(`[${migrateName}] ldap_config Table created`);
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

	return knex.schema.dropTable("ldap_config").then(() => {
		logger.info(`[${migrateName}] ldap_config Table dropped`);
	});
};

export { up, down };
