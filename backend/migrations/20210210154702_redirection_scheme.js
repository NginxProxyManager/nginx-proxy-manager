import { migrate as logger } from "../logger.js";

const migrateName = "redirection_scheme";

/**
 * Migrate
 *
 * @see https://knexjs.org/guide/migrations.html#migration-api
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema
		.table("redirection_host", (table) => {
			table.string("forward_scheme").notNull().defaultTo("$scheme");
		})
		.then(() => {
			logger.info(`[${migrateName}] redirection_host Table altered`);
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
		.table("redirection_host", (table) => {
			table.dropColumn("forward_scheme");
		})
		.then(() => {
			logger.info(`[${migrateName}] redirection_host Table altered`);
		});
};

export { up, down };
