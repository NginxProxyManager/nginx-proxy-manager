import express from "express";
import * as oidc from "openid-client";
import internalToken from "../../internal/token.js";
import errs from "../../lib/error.js";
import jwtdecode from "../../lib/express/jwt-decode.js";
import { sso as logger } from "../../logger.js";
import ssoClientModel from "../../models/sso_client.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * /api/sso/oauth2
 *
 * Routes related to OAuth Authorization Code Flow (OpenID Connect)
 */

router
	.route("/:client_id")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/sso/oauth2/123
	 *
	 * Initialize flow for specific SSO Client
	 */
	.get(async (req, res) => {
		logger.info("Initializing OAuth flow");
		ssoClientModel
			.query()
			.where({ is_deleted: 0, enabled: true, id: req.params.client_id })
			.withGraphFetched("[configuration_openid]")
			.first()
			.then((row) => getOpenIDInitParams(req, row))
			.then((params) => redirectToAuthorizationURL(res, params))
			.catch((err) => redirectWithError(res, err));
	});

router
	.route("/:client_id/callback")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/sso/oauth2/123/callback
	 *
	 * flow callback phase for specific SSO Client
	 */
	.get(async (req, res) => {
		logger.info("Processing callback");
		ssoClientModel
			.query()
			.where({ is_deleted: 0, enabled: true, id: req.params.client_id })
			.withGraphFetched("[configuration_openid]")
			.first()
			.then((config) => validateCallback(req, config))
			.then((token) => redirectWithJwtToken(res, token))
			.catch((err) => redirectWithError(res, err));
	});

/**
 * Executes discovery and returns the configured `openid-client` client
 *
 * @param {Setting} row
 * */
const getOpenIDClient = async (row) => {
	const config = row.configuration_openid;
	const issuerURL = config.configuration_url;
	const clientId = config.client_id;
	const clientSecret = config.client_secret;

	return oidc.discovery(new URL(issuerURL), clientId, clientSecret);
};

/**
 * Generates the authorization URL using PKCE when the IdP supports
 *
 * @param {Request} req
 * @param {Setting} row
 * @return { {String}, {String}, {String} } state, code_verifier and url
 * */
const getOpenIDInitParams = async (_req, row) => {
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
 * Parses state and code_verifier from cookie during the callback phase.
 *
 * @param {Request} req
 * @return { {String}, {String} } state and nonce
 * */
const parseStateFromCookie = (req) => {
	let state;
	let code_verifier;
	const cookies = req.headers.cookie.split(";");
	for (const cookie of cookies) {
		const [key, val] = cookie.split("=");
		if (key.trim() === "npm_sso_s") {
			state = val.trim();
		}
		if (key.trim() === "npm_sso_n") {
			code_verifier = val.trim();
		}
		if (state && code_verifier) break;
	}

	return { state, code_verifier };
};

/**
 * Validates callback parameters and requests authorization grant from the IdP,
 * then issues an internal JWT token upon success.
 *
 * @param {Request} req
 * @param {Setting} config
 * @return {Promise} a promise resolving to a jwt token
 * */
const validateCallback = async (req, config) => {
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
		const error = "The Identity Provider didn't send the 'email' claim";
		logger.error(`Claim error: ${error}`);
		throw new errs.AuthError(error);
	}
	logger.info(`Successful authentication for email ${claims.email}`);

	return internalToken.getTokenFromOAuthClaim(claims.email);
};

const redirectToAuthorizationURL = (res, params) => {
	const cleanURL = params.url ? String(params.url).replace(/(state|nonce)=([^&\n]+)/gi, "$1=***") : "";
	logger.info(`Redirect: Authorization URL: ${cleanURL}`);
	res.cookie("npm_sso_s", params.state);
	res.cookie("npm_sso_n", params.code_verifier);
	res.redirect(String(params.url));
};

const redirectWithJwtToken = (res, token) => {
	logger.info("Redirect success: /sso/oauth2/success");
	res.cookie("npm_sso_t", token.token);
	res.cookie("npm_sso_e", token.expires);
	res.redirect("/sso/oauth2/success");
};

const redirectWithError = (res, error) => {
	logger.error(`Redirect error: ${error.message}`);
	res.cookie("npm_sso_error", error.message);
	res.redirect("/login");
};

export default router;
