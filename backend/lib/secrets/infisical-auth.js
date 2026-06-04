import fs from "node:fs";
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
 * @param {string} host
 * @param {string} identityId
 * @param {string} jwt
 */
export const loginOidcAuth = async (host, identityId, jwt) => {
	const base = host.replace(/\/$/, "");
	const body = new URLSearchParams({ identityId, jwt });

	const response = await fetch(`${base}/api/v1/auth/oidc-auth/login`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: body.toString(),
		signal: AbortSignal.timeout(15000),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new errs.ValidationError(`Infisical OIDC Auth failed (${response.status}): ${text.slice(0, 200)}`);
	}

	const data = await response.json();
	const token = data.accessToken || data.access_token;
	if (!token) {
		throw new errs.ValidationError("Infisical OIDC Auth response missing accessToken");
	}

	return token;
};

/**
 * @param {Record<string, unknown>} meta
 */
export const resolveInfisicalJwt = (meta) => {
	const normalized = normalizeInfisicalMeta(meta);
	const filePath = normalized.jwt_file_path;
	const envVar = normalized.jwt_env_var;

	if (filePath && envVar) {
		throw new errs.ValidationError("Set only one of jwt_file_path or jwt_env_var for Infisical OIDC Auth");
	}
	if (filePath) {
		try {
			return fs.readFileSync(filePath, "utf8").trim();
		} catch (e) {
			throw new errs.ValidationError(`Could not read jwt_file_path: ${e.message}`);
		}
	}
	if (envVar) {
		const value = process.env[envVar];
		if (!value?.trim()) {
			throw new errs.ValidationError(`Environment variable ${envVar} is not set or empty`);
		}
		return value.trim();
	}

	throw new errs.ValidationError("Infisical OIDC Auth requires jwt_file_path or jwt_env_var in provider meta");
};

/**
 * @param {Object} provider
 * @param {string} [clientSecret]
 */
export const getInfisicalAccessToken = async (provider, clientSecret) => {
	const meta = normalizeInfisicalMeta(provider.meta || {});
	const host = meta.host || "https://app.infisical.com";

	if (meta.auth_method === "oidc") {
		const identityId = meta.identity_id;
		if (!identityId) {
			throw new errs.ValidationError("Infisical OIDC Auth requires identity_id in provider meta");
		}
		const jwt = resolveInfisicalJwt(meta);
		return loginOidcAuth(host, identityId, jwt);
	}

	if (!provider.oidc_client_id || !clientSecret) {
		throw new errs.ValidationError("Infisical Universal Auth requires client ID and client secret");
	}

	return loginUniversalAuth(host, provider.oidc_client_id, clientSecret);
};
