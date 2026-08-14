import fs from "node:fs/promises";
import { resolve } from "node:path";
import { migrateLocationNginxConfigToV2, migrateNginxConfigToV2 } from "../internal/nginx-config-normalizer.js";

const [, , command, inputPath, outputPath] = process.argv;
if (!["migrate", "restore"].includes(command) || !inputPath) {
	console.error("Usage: node backend/scripts/proxy-host-nginx-config-v2.js <migrate|restore> <input.json> [output.json]");
	process.exit(2);
}
const source = JSON.parse(await fs.readFile(resolve(inputPath), "utf8"));
const rows = Array.isArray(source) ? source : [source];
const result = rows.map((row) => {
	if (command === "restore") {
		const backup = row.nginx_config_migration_backup;
		if (!backup?.nginx_config) throw new Error(`Proxy Host ${row.id ?? "<unknown>"} has no migration backup`);
		return { ...row, nginx_config: backup.nginx_config, locations: backup.locations ?? [] };
	}
	return {
		...row,
		nginx_config_migration_backup: { nginx_config: row.nginx_config, locations: row.locations ?? [] },
		nginx_config: migrateNginxConfigToV2(row.nginx_config),
		locations: (row.locations ?? []).map((location, index) => ({
			...location,
			nginx_config: migrateLocationNginxConfigToV2(location.nginx_config, `locations[${index}].nginx_config`),
		})),
		nginx_config_schema_version: 2,
		nginx_config_migration_status: "migrated",
	};
});
const json = `${JSON.stringify(Array.isArray(source) ? result : result[0], null, 2)}\n`;
if (outputPath) await fs.writeFile(resolve(outputPath), json);
else process.stdout.write(json);
