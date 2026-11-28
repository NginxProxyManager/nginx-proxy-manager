import errs from "../error.js";

/**
 * OAuth2 client credentials token fetch.
 * @param {Object} config
 * @param {string} config.issuer
 * @param {string} config.clientId
 * @param {string} config.clientSecret
 * @param {string} [config.audience]
 * @param {string} [config.scope]
 */
export const fetchClientCredentialsToken = async (config) => {
	const tokenUrl = config.tokenUrl || `${config.issuer.replace(/\/$/, "")}/oauth/token`;

	const body = new URLSearchParams({
		grant_type: "client_credentials",
		client_id: config.clientId,
		client_secret: config.clientSecret,
	});

	if (config.audience) {
		body.set("audience", config.audience);
	}
	if (config.scope) {
		body.set("scope", config.scope);
	}

	const response = await fetch(tokenUrl, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: body.toString(),
		signal: AbortSignal.timeout(15000),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new errs.ValidationError(`OIDC token request failed (${response.status}): ${text.slice(0, 200)}`);
	}

	const data = await response.json();
	if (!data.access_token) {
		throw new errs.ValidationError("OIDC response missing access_token");
	}

	return data.access_token;
};

/**
 * Azure AD client credentials.
 */
export const fetchAzureAdToken = async ({ tenantId, clientId, clientSecret, scope }) => {
	const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
	const body = new URLSearchParams({
		grant_type: "client_credentials",
		client_id: clientId,
		client_secret: clientSecret,
		scope: scope || "https://vault.azure.net/.default",
	});

	const response = await fetch(tokenUrl, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: body.toString(),
		signal: AbortSignal.timeout(15000),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new errs.ValidationError(`Azure AD token failed (${response.status}): ${text.slice(0, 200)}`);
	}

	const data = await response.json();
	return data.access_token;
};
