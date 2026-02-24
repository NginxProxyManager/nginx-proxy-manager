import { migrate as logger } from "../logger.js";

const migrateName = "ldap_config_page_size";

/**
 * Migrate
 *
 * Adds the `page_size` column to `ldap_config`.
 *
 * This column controls the RFC 2696 Paged Results Control page size used
 * when performing full-directory LDAP scans in syncAllUsers.  A value of 0
 * (the default) means "use the built-in default of 500 entries per page".
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema
		.table("ldap_config", (table) => {
			table.integer("page_size").notNull().defaultTo(0);
		})
		.then(() => {
			logger.info(`[${migrateName}] Added page_size column to ldap_config`);
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
		.table("ldap_config", (table) => {
			table.dropColumn("page_size");
		})
		.then(() => {
			logger.info(`[${migrateName}] Removed page_size column from ldap_config`);
		});
};

export { up, down };
