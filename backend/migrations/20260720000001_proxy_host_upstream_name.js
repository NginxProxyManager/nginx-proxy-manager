import { migrate as logger } from "../logger.js";

const up = async (knex) => {
	logger.info("[proxy_host_upstream_name] Migrating Up...");
	await knex.schema.alterTable("proxy_host", (table) => {
		// NULL keeps automatic names independent; custom names are canonicalized
		// before persistence. A unique constraint also protects concurrent saves.
		table.string("upstream_name", 128).nullable();
		table.unique(["upstream_name"], "proxy_host_upstream_name_unique");
	});
};

const down = async (knex) => {
	logger.info("[proxy_host_upstream_name] Migrating Down...");
	await knex.schema.alterTable("proxy_host", (table) => {
		table.dropUnique(["upstream_name"], "proxy_host_upstream_name_unique");
		table.dropColumn("upstream_name");
	});
};

export { up, down };
