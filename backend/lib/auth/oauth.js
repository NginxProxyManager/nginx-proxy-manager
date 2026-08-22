import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { auth as logger } from "../../logger.js";
import errs from "../error.js";

const DISCOVERY_TTL_MS = 5 * 60 * 1000;
const discoveryCache = new Map();
const jwksCache = new Map();

const fetchJson = async (url, options) => {
	const response = await fetch(url, options);
	const text = await response.text();

	let payload;
	try {
		payload = JSON.parse(text);
	} catch (_) {
		throw new errs.AuthError(`Unexpected non-JSON response from ${url} (HTTP ${response.status})`);
	}

	if (!response.ok) {
		const detail = payload.error_description || payload.error || `HTTP ${response.status}`;
		throw new errs.AuthError(`Request to ${url} failed: ${detail}`);
	}
	return payload;
};

const cached = async (cache, key, loader) => {
	const hit = cache.get(key);
	if (hit && hit.expires > Date.now()) {
		return hit.value;
	}
	const value = await loader();
	cache.set(key, { value, expires: Date.now() + DISCOVERY_TTL_MS });
	return value;
};

/**
 * Resolves the endpoints for a provider, either from OIDC discovery or from
 * the manually configured URLs. Manual values always win, so a provider can use
 * discovery but override a single endpoint.
 *
 * @param   {Object} provider
 * @returns {Promise<Object>}
 */
const getEndpoints = async (provider) => {
	const meta = provider.meta || {};
	let discovered = {};

	if (meta.issuer_url) {
		const url = `${meta.issuer_url.replace(/\/+$/, "")}/.well-known/openid-configuration`;
		discovered = await cached(discoveryCache, url, () => {
			logger.debug(`Fetching OIDC discovery document: ${url}`);
			return fetchJson(url);
		});
	}

	const endpoints = {
		issuer: discovered.issuer || meta.issuer_url || null,
		authorization_url: meta.authorization_url || discovered.authorization_endpoint || null,
		token_url: meta.token_url || discovered.token_endpoint || null,
		userinfo_url: meta.userinfo_url || discovered.userinfo_endpoint || null,
		jwks_url: meta.jwks_url || discovered.jwks_uri || null,
	};

	if (!endpoints.authorization_url || !endpoints.token_url) {
		throw new errs.ConfigurationError(
			"OAuth provider is missing an authorization or token endpoint. Set an issuer URL for discovery, or configure the endpoints manually.",
		);
	}

	return endpoints;
};

/**
 * Creates the per-login values that must be remembered until the IdP redirects
 * the browser back to us.
 *
 * @param   {String} redirectUri
 * @returns {Object}
 */
const createFlow = (redirectUri) => ({
	nonce: crypto.randomBytes(32).toString("base64url"),
	codeVerifier: crypto.randomBytes(64).toString("base64url"),
	redirectUri,
});

/**
 * Builds the URL the browser is sent to.
 *
 * The `state` is supplied by the caller: it's the single use key under which
 * the flow is stored, so a response can only be accepted for a request we
 * actually made, and only once.
 *
 * @param   {Object} provider
 * @param   {Object} flow
 * @param   {String} state
 * @returns {Promise<String>}
 */
const buildAuthorizationUrl = async (provider, flow, state) => {
	const meta = provider.meta || {};
	if (!meta.client_id) {
		throw new errs.ConfigurationError("OAuth provider has no client ID configured");
	}

	const endpoints = await getEndpoints(provider);
	const codeChallenge = crypto.createHash("sha256").update(flow.codeVerifier).digest("base64url");

	const params = new URLSearchParams({
		response_type: "code",
		client_id: meta.client_id,
		redirect_uri: flow.redirectUri,
		scope: meta.scopes || "openid email profile",
		state,
		nonce: flow.nonce,
		code_challenge: codeChallenge,
		code_challenge_method: "S256",
	});

	const separator = endpoints.authorization_url.includes("?") ? "&" : "?";
	return `${endpoints.authorization_url}${separator}${params.toString()}`;
};

/**
 * Verifies an ID token's signature against the provider's JWKS.
 *
 * @param   {Object} provider
 * @param   {Object} endpoints
 * @param   {String} idToken
 * @param   {String} nonce
 * @returns {Promise<Object>} the verified claims
 */
const verifyIdToken = async (provider, endpoints, idToken, nonce) => {
	const meta = provider.meta || {};
	const decoded = jwt.decode(idToken, { complete: true });

	if (!decoded) {
		throw new errs.AuthError("The identity provider returned a malformed ID token");
	}

	if (!endpoints.jwks_url) {
		throw new errs.ConfigurationError(
			"Cannot verify the ID token because no JWKS URL is configured or discoverable. Configure a userinfo URL instead.",
		);
	}

	const jwks = await cached(jwksCache, endpoints.jwks_url, () => fetchJson(endpoints.jwks_url));
	const key = (jwks.keys || []).find((k) => !decoded.header.kid || k.kid === decoded.header.kid);
	if (!key) {
		// The IdP may have rotated its keys since we cached them
		jwksCache.delete(endpoints.jwks_url);
		throw new errs.AuthError("No matching signing key was found for the ID token");
	}

	const publicKey = crypto.createPublicKey({ key, format: "jwk" });
	const verifyOptions = {
		algorithms: [decoded.header.alg],
		audience: meta.client_id,
	};
	if (endpoints.issuer) {
		verifyOptions.issuer = endpoints.issuer;
	}

	const claims = jwt.verify(idToken, publicKey, verifyOptions);

	if (claims.nonce && nonce && claims.nonce !== nonce) {
		throw new errs.AuthError("The ID token nonce did not match the login request");
	}

	return claims;
};

/**
 * Exchanges an authorization code for the signed in user's identity.
 *
 * @param   {Object} provider
 * @param   {Object} flow   The values stored when the request was built
 * @param   {String} code
 * @returns {Promise<Object>}
 */
const completeAuthorization = async (provider, flow, code) => {
	const meta = provider.meta || {};
	const endpoints = await getEndpoints(provider);

	const body = new URLSearchParams({
		grant_type: "authorization_code",
		code,
		redirect_uri: flow.redirectUri,
		code_verifier: flow.codeVerifier,
	});

	const headers = {
		"Content-Type": "application/x-www-form-urlencoded",
		Accept: "application/json",
	};

	if (meta.use_basic_auth) {
		const basic = Buffer.from(`${meta.client_id}:${meta.client_secret || ""}`).toString("base64");
		headers.Authorization = `Basic ${basic}`;
	} else {
		body.set("client_id", meta.client_id);
		if (meta.client_secret) {
			body.set("client_secret", meta.client_secret);
		}
	}

	const tokens = await fetchJson(endpoints.token_url, { method: "POST", headers, body: body.toString() });

	// Claims are routinely split between the two sources: some providers only
	// put group memberships in the ID token, others only return a subject from
	// userinfo. Collect both and merge them.
	//
	// The ID token is only trusted when its signature can actually be checked,
	// which requires a JWKS endpoint.
	let idClaims = null;
	if (tokens.id_token && endpoints.jwks_url) {
		idClaims = await verifyIdToken(provider, endpoints, tokens.id_token, flow.nonce);
	}

	let userClaims = null;
	if (endpoints.userinfo_url && tokens.access_token) {
		userClaims = await fetchJson(endpoints.userinfo_url, {
			headers: {
				Authorization: `Bearer ${tokens.access_token}`,
				Accept: "application/json",
			},
		});
	}

	if (!idClaims && !userClaims) {
		throw new errs.AuthError(
			"The identity provider returned neither a verifiable ID token nor a usable userinfo endpoint",
		);
	}

	// A userinfo response for a different subject would mean the access token
	// and the ID token describe different people.
	if (idClaims?.sub && userClaims?.sub && idClaims.sub !== userClaims.sub) {
		throw new errs.AuthError("The identity provider returned conflicting subjects for this sign in");
	}

	const claims = { ...(idClaims || {}), ...(userClaims || {}) };

	const email = claims[meta.email_claim || "email"];
	if (!email) {
		throw new errs.AuthError(
			`The identity provider did not return a "${meta.email_claim || "email"}" claim, which is required`,
		);
	}

	return {
		identifier: String(claims.sub || email),
		email: String(email),
		name: claims[meta.name_claim || "name"] || String(email),
		nickname: claims[meta.nickname_claim] || null,
		groups: toArray(claims[meta.group_claim || "groups"]),
	};
};

/**
 * Group claims come back as arrays, single strings, or space/comma separated
 * strings depending on the provider.
 *
 * @param   {*} value
 * @returns {[String]}
 */
const toArray = (value) => {
	if (typeof value === "undefined" || value === null) {
		return [];
	}
	if (Array.isArray(value)) {
		return value.map(String);
	}
	return String(value)
		.split(/[\s,]+/)
		.filter((v) => v !== "");
};

/**
 * Checks that the provider's endpoints can be resolved.
 *
 * @param   {Object} provider
 * @returns {Promise}
 */
const test = async (provider) => {
	if (!provider.meta?.client_id) {
		throw new errs.ConfigurationError("OAuth provider has no client ID configured");
	}
	await getEndpoints(provider);
};

export { buildAuthorizationUrl, completeAuthorization, createFlow, getEndpoints, test, toArray };
