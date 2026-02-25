import { migrate as logger } from "../logger.js";

const migrateName = "user_email_unique";

/**
 * Migrate
 *
 * Adds a UNIQUE index on user.email.
 *
 * Without this constraint two concurrent JIT-provisioning requests for the same
 * LDAP user could both pass the "email not found" SELECT check and then both
 * attempt an INSERT, producing duplicate rows.  The unique index ensures the
 * database itself enforces the invariant and the application can detect and
 * recover from the race via a catch → retry-as-update path in provisionUser.
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
			// email is already NOT NULL; make it unique as well.
			// Knex names this index "user_email_unique" by default.
			table.unique("email");
		})
		.then(() => {
			logger.info(`[${migrateName}] user Table: UNIQUE index added on email column`);
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
			table.dropUnique("email");
		})
		.then(() => {
			logger.info(`[${migrateName}] user Table: UNIQUE index dropped from email column`);
		});
};

export { up, down };
