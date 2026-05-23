import { migrate as logger } from "../logger.js";

const migrateName = "settings";

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

	return knex.schema.createTable('setting', (table) => {
		table.string('id').notNull().primary();
		table.string('name', 100).notNull();
		table.string('description', 255).notNull();
		table.string('value', 255).notNull();
		table.json('meta').notNull();
	})
		.then(() => {
			logger.info(`[${migrateName}] setting Table created`);
		});
};

/**
 * Undo Migrate
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const down = (_knex) => {
	logger.warn(`[${migrateName}] You can't migrate down the initial data.`);
	return Promise.resolve(true);
};

export { up, down };
