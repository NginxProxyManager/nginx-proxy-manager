import { migrate as logger } from "../logger.js";

const migrateName = "oidc_support";

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema
		.alterTable("setting", (table) => {
			// Increase value column to TEXT to support larger values
			// (needed for encrypted client secrets stored in meta JSON)
			table.text("value").alter();
		})
		.then(() => {
			logger.info(`[${migrateName}] setting.value column altered to TEXT`);
		})
		.then(() => {
			// Add composite index on auth table for fast OIDC sub lookup
			return knex.schema.alterTable("auth", (table) => {
				table.index(["type", "secret", "user_id"], "idx_auth_type_secret_user");
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] auth table index added`);
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
		.alterTable("setting", (table) => {
			table.string("value", 255).alter();
		})
		.then(() => {
			logger.info(`[${migrateName}] setting.value column reverted to VARCHAR(255)`);
		})
		.then(() => {
			return knex.schema.alterTable("auth", (table) => {
				table.dropIndex(["type", "secret", "user_id"], "idx_auth_type_secret_user");
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] auth table index removed`);
		});
};

export { up, down };
