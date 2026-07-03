/**
 * Normalize provider meta (supports legacy camelCase keys from early UI).
 * @param {Record<string, unknown>|null|undefined} meta
 */
export const normalizeInfisicalMeta = (meta) => {
	const m = meta && typeof meta === "object" ? meta : {};
	return {
		host: (m.host || "https://app.infisical.com").toString().replace(/\/$/, ""),
		workspace_id: (m.workspace_id || m.workspaceId || "").toString().trim(),
		environment_slug: (m.environment_slug || m.environmentSlug || "prod").toString().trim(),
		auth_method: "universal",
		token_url: (m.token_url || m.tokenUrl || "").toString().trim(),
	};
};
