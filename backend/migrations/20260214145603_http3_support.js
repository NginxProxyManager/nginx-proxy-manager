import { migrate as logger } from "../logger.js";

const migrateName = "npmplus_http3_support";

/**
 * Migrate
 *
 * @see https://knexjs.org/guide/migrations.html#migration-api
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const up = async (knex) => {
	const proxyHostHasHttp3Column = await knex.schema.hasColumn("proxy_host", "npmplus_http3_support");
	const redirectHostHasHttp3Column = await knex.schema.hasColumn("redirection_host", "npmplus_http3_support");
	const deadHostHasHttp3Column = await knex.schema.hasColumn("dead_host", "npmplus_http3_support");

	if (proxyHostHasHttp3Column && redirectHostHasHttp3Column && deadHostHasHttp3Column) {
		return;
	}

	logger.info(`[${migrateName}] Migrating Up...`);

	if (!proxyHostHasHttp3Column) {
		await knex.schema.table("proxy_host", (proxy_host) => {
			proxy_host.integer("npmplus_http3_support").notNull().unsigned().defaultTo(0);
		});
		logger.info(`[${migrateName}] proxy_host Table altered`);
	}

	if (!redirectHostHasHttp3Column) {
		await knex.schema.table("redirection_host", (redirection_host) => {
			redirection_host.integer("npmplus_http3_support").notNull().unsigned().defaultTo(0);
		});
		logger.info(`[${migrateName}] redirection_host Table altered`);
	}

	if (!deadHostHasHttp3Column) {
		await knex.schema.table("dead_host", (dead_host) => {
			dead_host.integer("npmplus_http3_support").notNull().unsigned().defaultTo(0);
		});
		logger.info(`[${migrateName}] dead_host Table altered`);
	}
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
