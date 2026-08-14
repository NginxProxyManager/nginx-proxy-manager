import { migrateLocationNginxConfigToV2, migrateNginxConfigToV2 } from "../internal/nginx-config-normalizer.js";
import { scanAdvancedConfig } from "../internal/nginx-config-diagnostics.js";

const parseJson = (value, fallback) => {
	if (value === null || typeof value === "undefined") return structuredClone(fallback);
	if (typeof value === "string") return JSON.parse(value);
	return structuredClone(value);
};
const serializeForClient = (client, value) => (["sqlite3", "better-sqlite3"].includes(client) ? JSON.stringify(value) : value);

export async function up(knex) {
	await knex.schema.alterTable("proxy_host", (table) => {
		table.integer("nginx_config_schema_version").unsigned().notNullable().defaultTo(2);
		table.string("nginx_config_migration_status", 32).notNullable().defaultTo("native_v2");
		table.json("nginx_config_migration_backup").nullable();
		table.json("nginx_config_migration_diagnostics").nullable();
		table.dateTime("nginx_config_migrated_on").nullable();
	});
	const client = knex.client.config.client;
	const rows = await knex("proxy_host").select("id", "nginx_config", "locations", "advanced_config");
	for (const row of rows) {
		const nginxConfig = parseJson(row.nginx_config, { schema_version: 1 });
		if (nginxConfig.schema_version === 2) {
			await knex("proxy_host").where({ id: row.id }).update({ nginx_config_schema_version: 2, nginx_config_migration_status: "native_v2" });
			continue;
		}
		const locations = parseJson(row.locations, []);
		const diagnostics = [
			...scanAdvancedConfig(row.advanced_config),
			...locations.flatMap((location, index) =>
				scanAdvancedConfig(location.advanced_config).map((item) => ({ ...item, scope: "location", location_index: index, path: location.path })),
			),
		];
		const conflicts = diagnostics.some((item) => item.severity === "error");
		const backup = { schema_version: 1, nginx_config: nginxConfig, locations };
		if (conflicts) {
			await knex("proxy_host").where({ id: row.id }).update({
				nginx_config_schema_version: 1,
				nginx_config_migration_status: "review_required",
				nginx_config_migration_backup: serializeForClient(client, backup),
				nginx_config_migration_diagnostics: serializeForClient(client, diagnostics),
			});
			continue;
		}
		const migratedConfig = migrateNginxConfigToV2(nginxConfig);
		const migratedLocations = locations.map((location, index) => ({
			...location,
			nginx_config: migrateLocationNginxConfigToV2(location.nginx_config, `locations[${index}].nginx_config`),
		}));
		await knex("proxy_host").where({ id: row.id }).update({
			nginx_config: serializeForClient(client, migratedConfig),
			locations: serializeForClient(client, migratedLocations),
			nginx_config_schema_version: 2,
			nginx_config_migration_status: "migrated",
			nginx_config_migration_backup: serializeForClient(client, backup),
			nginx_config_migration_diagnostics: serializeForClient(client, diagnostics),
			nginx_config_migrated_on: knex.fn.now(),
		});
	}
}

export async function down(knex) {
	const client = knex.client.config.client;
	const rows = await knex("proxy_host").select("id", "nginx_config_migration_backup");
	for (const row of rows) {
		const backup = parseJson(row.nginx_config_migration_backup, null);
		if (!backup?.nginx_config) continue;
		await knex("proxy_host").where({ id: row.id }).update({
			nginx_config: serializeForClient(client, backup.nginx_config),
			locations: serializeForClient(client, backup.locations ?? []),
		});
	}
	await knex.schema.alterTable("proxy_host", (table) => {
		table.dropColumn("nginx_config_migrated_on");
		table.dropColumn("nginx_config_migration_diagnostics");
		table.dropColumn("nginx_config_migration_backup");
		table.dropColumn("nginx_config_migration_status");
		table.dropColumn("nginx_config_schema_version");
	});
}
