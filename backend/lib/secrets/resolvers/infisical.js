import errs from "../../error.js";
import { toCertbotIni } from "../format.js";

/**
 * Infisical universal auth / OIDC.
 * meta: { host, identity_id }
 * secretRef.path: secret path e.g. /dns/cloudflare
 */
export const resolveInfisical = async (provider, secretRef, accessToken) => {
	const host = (provider.meta?.host || "https://app.infisical.com").replace(/\/$/, "");
	const { workspace_id, environment_slug = "prod" } = provider.meta || {};

	if (!workspace_id) {
		throw new errs.ValidationError("Infisical provider requires workspace_id in meta");
	}

	const secretPath = secretRef.path?.replace(/^\//, "") || "";
	const url = `${host}/api/v3/secrets/raw/${encodeURIComponent(secretPath)}?workspaceId=${workspace_id}&environment=${environment_slug}`;

	const response = await fetch(url, {
		headers: { Authorization: `Bearer ${accessToken}` },
		signal: AbortSignal.timeout(15000),
	});

	if (!response.ok) {
		throw new errs.ValidationError(`Infisical secret fetch failed (${response.status})`);
	}

	const data = await response.json();
	const secret = data.secret || data;
	if (secretRef.field && secret?.secretKey === secretRef.field) {
		return toCertbotIni(secret.secretValue);
	}
	if (typeof secret === "object" && secret.secretValue) {
		return toCertbotIni(secret.secretValue);
	}
	return toCertbotIni(data, secretRef.field);
};
