import { migrate as logger } from "../logger.js";

const up = async (knex) => {
	logger.info("[proxy_host_forwarding_mode] Migrating Up...");
	await knex.schema.alterTable("proxy_host", (table) => {
		// NULL keeps existing hosts' automatic selection until explicitly saved.
		table.string("forwarding_mode", 16).nullable();
	});
};

const down = async (knex) => {
	logger.info("[proxy_host_forwarding_mode] Migrating Down...");
	await knex.schema.alterTable("proxy_host", (table) => {
		table.dropColumn("forwarding_mode");
	});
};

export { up, down };
