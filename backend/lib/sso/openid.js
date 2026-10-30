import * as oidc from "openid-client";
import { sso as logger } from "../../logger.js";
import { decryptRSA } from "../encrypt.js";
import errs from "../error.js";
import { concludeAuthorized, parseStateFromCookie } from "./lib.js";

/**
 * Executes discovery and returns the configured `openid-client` client
 *
 * @param {Setting} row
 * */
const getOpenIDClient = async (row) => {
	const config = row.configuration_openid;
	const issuerURL = config.configuration_url;
	const clientId = config.client_id;
	const clientSecret = decryptRSA(Buffer.from(config.client_secret, "base64"));

	let url;
	try {
		url = new URL(issuerURL);
	} catch (_error) {
		throw new errs.AuthError(`Invalid OpenID Connect discovery URL "${issuerURL}"`);
	}

	return oidc.discovery(url, clientId, clientSecret);
};

/**
 * Generates the authorization URL using PKCE when the IdP supports
 *
 * @param {Request} req
 * @param {Setting} row
 * @return { {String}, {String}, {String} } state, code_verifier and url
 * */
const getOpenIDInitParams = async (_req, row) => {
	// The SSO Client might have been disabled or deleted or invalid client_id in URL
	if (!row) {
		throw new errs.AuthError("Unexpected error, please try again later.");
	}

	const client = await getOpenIDClient(row);
	const redirect_uri = row.configuration_openid.redirect_url;
	const scope = "openid email profile";

	const code_verifier = oidc.randomPKCECodeVerifier();
	const code_challenge = await oidc.calculatePKCECodeChallenge(code_verifier);
	let state;

	const parameters = {
		redirect_uri,
		scope,
		code_challenge,
		code_challenge_method: "S256",
	};

	if (!client.serverMetadata().supportsPKCE()) {
		state = oidc.randomState();
		parameters.state = state;
	}

	const url = oidc.buildAuthorizationUrl(client, parameters);

	return { state, code_verifier, url };
};

/**
 * Validates callback parameters and requests authorization grant from the IdP.
 *
 * @param {Request} req
 * @param {Setting} config
 * @return {Promise} a promise resolving to a jwt token
 * */
const validateOpenIDCallback = async (req, config) => {
	const client = await getOpenIDClient(config);
	const currentUrl = `${config.configuration_openid.redirect_url}?${req.originalUrl?.split("?")?.[1]}`;
	const { state, code_verifier } = parseStateFromCookie(req);
	const checks = { pkceCodeVerifier: code_verifier, idTokenExpected: true };

	if (state) {
		checks.expectedState = state;
	}

	const tokens = await oidc.authorizationCodeGrant(
		client,
		// when PKCE is used, state must equal to the string 'undefined'
		new URL(currentUrl.replace("&state=", "&state=undefined")),
		checks,
	);

	const claims = tokens.claims();
	if (!claims.email) {
		logger.error(`[${req.params.client_id}] The Identity Provider didn't send the 'email' claim`);
		throw new errs.AuthError("sso.error.email-claim-required");
	}

	return concludeAuthorized(config, claims);
};

export { getOpenIDInitParams, validateOpenIDCallback };
