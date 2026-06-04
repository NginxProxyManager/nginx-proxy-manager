import errs from "../../error.js";
import { parseInfisicalSecretRef } from "../infisical-path.js";
import { toCertbotIni } from "../format.js";
import { normalizeInfisicalMeta } from "../meta.js";

/**
 * Infisical universal auth / OIDC.
 * secretRef.path: folder + secret key (e.g. /DNS/cloudflare-api-token) or key only at /
 * secretRef.field: optional secret key when path is folder only (e.g. path /DNS, field cloudflare-api-token)
 */
export const resolveInfisical = async (provider, secretRef, accessToken) => {
	const { host, workspace_id, environment_slug } = normalizeInfisicalMeta(provider.meta);

	if (!workspace_id) {
		throw new errs.ValidationError("Infisical provider requires workspace_id in meta");
	}

	const { secretName, secretPath } = parseInfisicalSecretRef(secretRef);
	const params = new URLSearchParams({
		workspaceId: workspace_id,
		environment: environment_slug,
		secretPath,
	});
	const base = host.replace(/\/$/, "");
	const url = `${base}/api/v3/secrets/raw/${encodeURIComponent(secretName)}?${params}`;

	const response = await fetch(url, {
		headers: { Authorization: `Bearer ${accessToken}` },
		signal: AbortSignal.timeout(15000),
	});

	if (!response.ok) {
		const text = await response.text();
		let detail = text.slice(0, 200);
		try {
			const body = JSON.parse(text);
			if (body.message) detail = body.message;
		} catch {
			// keep raw snippet
		}
		throw new errs.ValidationError(`Infisical secret fetch failed (${response.status}): ${detail}`);
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
