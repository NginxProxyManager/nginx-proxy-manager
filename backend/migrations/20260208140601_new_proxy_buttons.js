import { migrate as logger } from "../logger.js";

const migrateName = "new_proxy_buttons";

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const up = async (knex) => {
	const hasRequestBuffering = await knex.schema.hasColumn("proxy_host", "npmplus_proxy_request_buffering");
	const hasResponseBuffering = await knex.schema.hasColumn("proxy_host", "npmplus_proxy_response_buffering");
	const hasFancyindexUpstreamCompression = await knex.schema.hasColumn(
		"proxy_host",
		"npmplus_fancyindex_upstream_compression",
	);
	const hasNoindex = await knex.schema.hasColumn("proxy_host", "npmplus_noindex");

	if (hasRequestBuffering && hasResponseBuffering && hasFancyindexUpstreamCompression && hasNoindex) {
		return;
	}

	logger.info(`[${migrateName}] Migrating Up...`);

	await knex.schema.table("proxy_host", (proxy_host) => {
		if (!hasRequestBuffering) {
			proxy_host.integer("npmplus_proxy_request_buffering").notNull().unsigned().defaultTo(0);
		}
		if (!hasResponseBuffering) {
			proxy_host.integer("npmplus_proxy_response_buffering").notNull().unsigned().defaultTo(0);
		}
		if (!hasFancyindexUpstreamCompression) {
			proxy_host.integer("npmplus_fancyindex_upstream_compression").notNull().unsigned().defaultTo(0);
		}
		if (!hasNoindex) {
			proxy_host.integer("npmplus_noindex").notNull().unsigned().defaultTo(0);
		}
	});

	logger.info(`[${migrateName}] proxy_host Table altered`);
};

/**
 * Undo Migrate
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const down = (_knex) => {
	logger.warn(`[${migrateName}] You can't migrate down this one.`);
	return Promise.resolve(true);
};

export { up, down };
