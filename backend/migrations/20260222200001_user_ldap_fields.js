import { migrate as logger } from "../logger.js";

const migrateName = "user_ldap_fields";

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
		.alterTable("user", (table) => {
			table.string("auth_source").notNull().defaultTo("local");
		})
		.then(() => {
			logger.info(`[${migrateName}] user Table altered: auth_source column added`);

			return knex.schema.alterTable("auth", (table) => {
				table.string("ldap_dn").nullable();
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] auth Table altered: ldap_dn column added`);
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
		.alterTable("user", (table) => {
			table.dropColumn("auth_source");
		})
		.then(() => {
			logger.info(`[${migrateName}] user Table altered: auth_source column dropped`);

			return knex.schema.alterTable("auth", (table) => {
				table.dropColumn("ldap_dn");
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] auth Table altered: ldap_dn column dropped`);
		});
};

export { up, down };
