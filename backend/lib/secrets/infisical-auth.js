import errs from "../error.js";
import { normalizeInfisicalMeta } from "./meta.js";

/**
 * @param {string} host
 * @param {string} clientId
 * @param {string} clientSecret
 */
export const loginUniversalAuth = async (host, clientId, clientSecret) => {
	const base = host.replace(/\/$/, "");
	const url = `${base}/api/v1/auth/universal-auth/login`;

	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ clientId, clientSecret }),
		signal: AbortSignal.timeout(15000),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new errs.ValidationError(
			`Infisical Universal Auth failed (${response.status}): ${text.slice(0, 200)}`,
		);
	}

	const data = await response.json();
	const token = data.accessToken || data.access_token;
	if (!token) {
		throw new errs.ValidationError("Infisical Universal Auth response missing accessToken");
	}

	return token;
};

/**
 * @param {Object} provider
 * @param {string} [clientSecret]
 */
export const getInfisicalAccessToken = async (provider, clientSecret) => {
	const meta = normalizeInfisicalMeta(provider.meta || {});
	const host = meta.host || "https://app.infisical.com";

	if (!provider.oidc_client_id || !clientSecret) {
		throw new errs.ValidationError("Infisical Universal Auth requires client ID and client secret");
	}

	return loginUniversalAuth(host, provider.oidc_client_id, clientSecret);
};
