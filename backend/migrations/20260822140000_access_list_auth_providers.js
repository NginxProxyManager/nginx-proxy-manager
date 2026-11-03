import { migrate as logger } from "../logger.js";

const migrateName = "access_list_auth_providers";

/**
 * Migrate
 *
 * Lets an access list accept the same directory and identity provider accounts
 * used to sign in to the admin interface, rather than only the usernames and
 * passwords typed into the list itself.
 *
 * Both columns are nullable json rather than notNull with a default, because
 * MySQL refuses a default on a JSON column. Absent is read as empty.
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema
		.table("access_list", (table) => {
			// Providers whose users may authenticate against this list
			table.json("auth_provider_ids").nullable();
			// When set, a provider user must also be in one of these groups
			table.json("allowed_groups").nullable();
		})
		.then(() => {
			logger.info(`[${migrateName}] access_list Table altered`);
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
		.table("access_list", (table) => {
			table.dropColumn("auth_provider_ids");
			table.dropColumn("allowed_groups");
		})
		.then(() => {
			logger.info(`[${migrateName}] access_list Columns dropped`);
		});
};

export { up, down };
