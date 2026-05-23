import { migrate as logger } from "../logger.js";

const migrateName = "redirect_auto_scheme";

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
		.table("redirection_host", async (table) => {
			// change the column default from $scheme to auto
			await table.string("forward_scheme").notNull().defaultTo("auto").alter();
			await knex('redirection_host')
				.where('forward_scheme', '$scheme')
				.update({ forward_scheme: 'auto' });
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
		.table("redirection_host", async (table) => {
			await table.string("forward_scheme").notNull().defaultTo("$scheme").alter();
			await knex('redirection_host')
				.where('forward_scheme', 'auto')
				.update({ forward_scheme: '$scheme' });
		})
		.then(() => {
			logger.info(`[${migrateName}] redirection_host Table altered`);
		});
};

export { up, down };
