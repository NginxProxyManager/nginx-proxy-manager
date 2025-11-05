import internalNginx from "../internal/nginx.js";
import { migrate as logger } from "../logger.js";

const migrateName = "stream_domain";

async function regenerateDefaultHost(knex) {
	const row = await knex("setting").select("*").where("id", "default-site").first();

	if (!row) {
		return Promise.resolve();
	}

	return internalNginx
		.deleteConfig("default")
		.then(() => {
			return internalNginx.generateConfig("default", row);
		})
		.then(() => {
			return internalNginx.test();
		})
		.then(() => {
			return internalNginx.reload();
		});
}

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

	return regenerateDefaultHost(knex);
};

/**
 * Undo Migrate
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	return regenerateDefaultHost(knex);
};

export { up, down };
