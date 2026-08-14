export const buildDesiredNginxArtifact = (row = {}) => {
	const storedSchemaVersion = row.nginx_config_schema_version ?? row.nginx_config?.schema_version ?? 2;
	const migrationBackup = row.nginx_config_migration_backup;
	const useLegacyBackup =
		storedSchemaVersion === 1 &&
		migrationBackup?.nginx_config &&
		typeof migrationBackup.nginx_config === "object" &&
		!Array.isArray(migrationBackup.nginx_config);
	const nginxConfig = structuredClone(useLegacyBackup ? migrationBackup.nginx_config : row.nginx_config);
	return {
		schema_version: nginxConfig?.schema_version ?? storedSchemaVersion,
		revision: row.nginx_config_revision ?? 1,
		nginx_config: nginxConfig,
	};
};

export default { buildDesiredNginxArtifact };
