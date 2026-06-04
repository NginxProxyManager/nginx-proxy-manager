/**
 * Normalize provider meta (supports legacy camelCase keys from early UI).
 * @param {Record<string, unknown>|null|undefined} meta
 */
export const normalizeInfisicalMeta = (meta) => {
	const m = meta && typeof meta === "object" ? meta : {};
	const authMethod = m.auth_method || m.authMethod || "universal";
	return {
		host: (m.host || "https://app.infisical.com").toString().replace(/\/$/, ""),
		workspace_id: (m.workspace_id || m.workspaceId || "").toString().trim(),
		environment_slug: (m.environment_slug || m.environmentSlug || "prod").toString().trim(),
		auth_method: authMethod === "oidc" ? "oidc" : "universal",
		identity_id: (m.identity_id || m.identityId || "").toString().trim(),
		jwt_file_path: (m.jwt_file_path || m.jwtFilePath || "").toString().trim(),
		jwt_env_var: (m.jwt_env_var || m.jwtEnvVar || "").toString().trim(),
		token_url: (m.token_url || m.tokenUrl || "").toString().trim(),
	};
};
