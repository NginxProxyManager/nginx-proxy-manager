import { AuthClient } from "@auth0/auth0-auth-js";
import { sso as logger } from "../../logger.js";
import { decryptRSA } from "../encrypt.js";
import errs from "../error.js";
import { concludeAuthorized, parseStateFromCookie } from "./lib.js";

/**
 *
 *
 * @param {Setting} row
 * */
const getAuth0Client = async (row, params) => {
	const config = row.configuration_auth0;
	const domain = config.domain;
	const clientId = config.client_id;
	const clientSecret = decryptRSA(Buffer.from(config.client_secret, "base64"));

	let authParams = {
		domain,
		clientId,
		clientSecret,
	};

	if (params) {
		authParams = { ...authParams, ...params };
	}

	const auth0Client = new AuthClient(authParams);

	return auth0Client;
};

/**
 * Generates the authorization URL
 *
 * @param {Request} req
 * @param {Setting} row
 * @return { {String}, {String}, {String} } state, code_verifier and url
 * */
const getAuth0InitParams = async (_req, row) => {
	// The SSO Client might have been disabled or deleted, or invalid client_id in URL
	if (!row) {
		throw new errs.AuthError("sso.error.default");
	}

	const client = await getAuth0Client(row, {
		authorizationParams: { redirect_uri: row.configuration_auth0.redirect_url },
	});

	const { authorizationUrl, codeVerifier } = await client.buildAuthorizationUrl();

	return { code_verifier: codeVerifier, url: authorizationUrl };
};

/**
 * Validates callback parameters and requests authorization grant from the IdP.
 *
 * @param {Request} req
 * @param {Setting} config
 * @return {Promise} a promise resolving to a jwt token
 * */
const validateAuth0Callback = async (req, config) => {
	const currentUrl = `${config.configuration_auth0.redirect_url}?${req.originalUrl?.split("?")?.[1]}`;
	const client = await getAuth0Client(config, { authorizationParams: { redirect_uri: config.redirect_url } });
	const { code_verifier } = parseStateFromCookie(req);
	const checks = { codeVerifier: code_verifier };

	const tokens = await client.getTokenByCode(new URL(currentUrl), checks);
	const claims = tokens.claims;
	if (!claims.email) {
		logger.error(`[${req.params.client_id}] The Identity Provider didn't send the 'email' claim`);
		throw new errs.AuthError("sso.error.email-claim-required");
	}

	return concludeAuthorized(config, claims);
};

export { getAuth0InitParams, validateAuth0Callback };
