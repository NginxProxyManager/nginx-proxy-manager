import {
	authorizationCodeGrant,
	buildAuthorizationUrl,
	buildEndSessionUrl,
	discovery,
	fetchUserInfo,
	skipSubjectCheck,
	allowInsecureRequests,
} from "openid-client";
import errs from "./error.js";
import { oidc as logger } from "../logger.js";

const DEFAULT_SCOPES = "openid profile email";
let clientConfigPromise = null;
let oidcConfig = null;

const toBool = (value) => /^(1|true|yes|on)$/i.test((value || "").trim());

const isOIDCEnabled = () => {
	return Boolean(process.env.OIDC_ISSUER_URL && process.env.OIDC_CLIENT_ID);
};

const parseScopes = () => {
	const scopesRaw = process.env.OIDC_SCOPES || DEFAULT_SCOPES;
	return scopesRaw
		.split(/[\s,]+/)
		.map((scope) => scope.trim())
		.filter(Boolean)
		.join(" ");
};

const getDiscoveryUrl = (issuerUrl) => {
	const url = new URL(issuerUrl);
	if (url.pathname.endsWith("/.well-known/openid-configuration")) {
		return url;
	}

	const basePath = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
	url.pathname = `${basePath}.well-known/openid-configuration`;
	url.search = "";
	url.hash = "";
	return url;
};

const getOIDCConfig = () => {
	if (oidcConfig) {
		return oidcConfig;
	}

	if (!isOIDCEnabled()) {
		oidcConfig = { enabled: false };
		return oidcConfig;
	}

	const redirectUri = process.env.OIDC_REDIRECT_URI;
	if (!redirectUri) {
		throw new errs.ConfigurationError("OIDC_REDIRECT_URI must be configured when OIDC is enabled");
	}

	const insecureRequestsEnabled = toBool(process.env.OIDC_ALLOW_INSECURE_REQUESTS);
	if (insecureRequestsEnabled) {
		logger.warn("OIDC_ALLOW_INSECURE_REQUESTS is enabled. Use only in local development.");
	}

	// Use separate URLs for internal backend communication and browser-facing URLs
	// OIDC_ISSUER_URL_INTERNAL is used for backend discovery and token exchange (can use Docker network hostnames). Defaults to OIDC_ISSUER_URL
	// OIDC_ISSUER_URL is used for building authorization URLs sent to the browser (must be accessible from client)
	const issuerUrl = process.env.OIDC_ISSUER_URL;
	const issuerUrlInternal = process.env.OIDC_ISSUER_URL_INTERNAL || issuerUrl;

	oidcConfig = {
		enabled: true,
		issuerUrlInternal: issuerUrlInternal,
		issuerUrl: issuerUrl,
		clientId: process.env.OIDC_CLIENT_ID,
		clientSecret: process.env.OIDC_CLIENT_SECRET,
		redirectUri,
		scopes: parseScopes(),
		identifierField: process.env.OIDC_IDENTIFIER_FIELD || "email",
		autoCreateUser: process.env.OIDC_AUTO_CREATE_USER === "true",
		autoLogin: toBool(process.env.OIDC_AUTO_LOGIN),
		logoutRedirectUri: process.env.OIDC_LOGOUT_REDIRECT_URI,
		allowInsecureRequests: insecureRequestsEnabled,
	};
	return oidcConfig;
};

const getOIDCClientConfig = async () => {
	const config = getOIDCConfig();
	if (!config.enabled) {
		throw new errs.ConfigurationError("OIDC is not configured");
	}

	if (!clientConfigPromise) {
		const options = {};
		if (config.allowInsecureRequests) {
			options.execute = [allowInsecureRequests];
		}

		const discoveryUrl = getDiscoveryUrl( config.issuerUrlInternal).toString();
		clientConfigPromise = discovery(
			new URL(discoveryUrl),
			config.clientId,
			config.clientSecret,
			null,
			options,
		).catch((err) => {
			throw new errs.ConfigurationError(
				`OIDC discovery failed for ${discoveryUrl}: ${err.message}`,
				err,
			);
		});
	}

	return clientConfigPromise;
};

/**
 * @param {{ state: string, nonce: string }} params
 * @returns {Promise<string>} Authorization URL to redirect the browser to
 */
const buildAuthorizationUrlHelper = async ({ state, nonce }) => {
	const clientConfig = await getOIDCClientConfig();
	const config = getOIDCConfig();
	const authorizationUrl = buildAuthorizationUrl(clientConfig, {
		redirect_uri: config.redirectUri,
		scope: config.scopes,
		state,
		nonce,
	});

	if (config.issuerUrl && config.issuerUrl !== config.issuerUrlInternal) {
		// Replace protocol, host and port
		const issuerUrl = new URL(config.issuerUrl);
		authorizationUrl.protocol = issuerUrl.protocol;
		authorizationUrl.host = issuerUrl.host;
		authorizationUrl.port = issuerUrl.port;
	}
	return authorizationUrl.href;
};

/**
 * Exchange an authorization code for tokens.
 *
 * @param {{ callbackUrl: string, expectedState: string, expectedNonce: string }} params
 *   callbackUrl must be the full URL the browser was redirected to (including query string).
 *   State and nonce validation is performed internally by authorizationCodeGrant.
 * @returns {Promise<import("openid-client").TokenEndpointResponse>}
 */
const exchangeAuthorizationCode = async ({ callbackUrl, expectedState, expectedNonce }) => {
	const clientConfig = await getOIDCClientConfig();
	return authorizationCodeGrant(clientConfig, new URL(callbackUrl), {
		expectedState,
		expectedNonce,
		idTokenExpected: true,
	});
};

/**
 * @param {import("openid-client").TokenEndpointResponse} tokens
 * @returns {Promise<import("openid-client").UserInfoResponse>}
 */
const getUserInfo = async (tokens) => {
	const clientConfig = await getOIDCClientConfig();
	// skipSubjectCheck: we match users by email, not by sub
	return fetchUserInfo(clientConfig, tokens.access_token, skipSubjectCheck);
};

/**
 * Builds the IdP end-session (logout) URL, or returns null if the IdP does
 * not advertise an end_session_endpoint in its discovery document.
 *
 * @param {{ postLogoutRedirectUri: string, idTokenHint?: string }} params
 * @returns {Promise<string|null>}
 */
const buildIdpLogoutUrl = async ({ postLogoutRedirectUri, idTokenHint }) => {
	if (!isOIDCEnabled()) {
		return null;
	}
	const config = getOIDCConfig();
	const clientConfig = await getOIDCClientConfig();
	if (!clientConfig.serverMetadata().end_session_endpoint) {
		return null;
	}

	const params = { post_logout_redirect_uri: postLogoutRedirectUri };
	if (idTokenHint) {
		params.id_token_hint = idTokenHint;
	}

	const logoutUrl = buildEndSessionUrl(clientConfig, params);
	if (config.issuerUrl && config.issuerUrl !== config.issuerUrlInternal) {
		// Replace protocol, host and port
		const issuerUrl = new URL(config.issuerUrl);
		logoutUrl.protocol = issuerUrl.protocol;
		logoutUrl.host = issuerUrl.host;
		logoutUrl.port = issuerUrl.port;
	}
	return logoutUrl.href;
};

export {
	buildAuthorizationUrlHelper as buildAuthorizationUrl,
	buildIdpLogoutUrl,
	exchangeAuthorizationCode,
	getOIDCConfig,
	getUserInfo,
	isOIDCEnabled,
};
