import { migrate as logger } from "../logger.js";

const migrateName = "reset_button_values";

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	await knex("proxy_host").update({
		caching_enabled: 0,
		block_exploits: 0,
		allow_websocket_upgrade: 0,
	});

	logger.info(`[${migrateName}] proxy_host values reset`);
};

/**
 * Undo Migrate
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const down = (knex) => {
	logger.warn(`[${migrateName}] You can't migrate down this one.`);
	return Promise.resolve(true);
};

export { up, down };
