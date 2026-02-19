import { migrate as logger } from "../logger.js";

const migrateName = "new_and_split_proxy_buttons";

/**
 * Migrate
 *
 * @see https://knexjs.org/guide/migrations.html#migration-api
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const up = async (knex) => {
	const hasCrowdsecAppsec = await knex.schema.hasColumn("proxy_host", "npmplus_crowdsec_appsec");
	const hasUpstreamCompression = await knex.schema.hasColumn("proxy_host", "npmplus_upstream_compression");
	const hasFancyindex = await knex.schema.hasColumn("proxy_host", "npmplus_fancyindex");
	const hasFancyindexUpstreamCompression = await knex.schema.hasColumn(
		"proxy_host",
		"npmplus_fancyindex_upstream_compression",
	);

	if (hasCrowdsecAppsec && hasUpstreamCompression && hasFancyindex && !hasFancyindexUpstreamCompression) {
		return;
	}

	logger.info(`[${migrateName}] Migrating Up...`);

	await knex.schema.table("proxy_host", (proxy_host) => {
		if (!hasCrowdsecAppsec) {
			proxy_host.integer("npmplus_crowdsec_appsec").notNull().unsigned().defaultTo(0);
		}
		if (!hasUpstreamCompression) {
			proxy_host.integer("npmplus_upstream_compression").notNull().unsigned().defaultTo(0);
		}
		if (!hasFancyindex) {
			proxy_host.integer("npmplus_fancyindex").notNull().unsigned().defaultTo(0);
		}
		if (hasFancyindexUpstreamCompression) {
			proxy_host.dropColumn("npmplus_fancyindex_upstream_compression");
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
