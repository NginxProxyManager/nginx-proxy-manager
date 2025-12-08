import * as client from "openid-client";
import express from "express";
import errs from "../lib/error.js";
import internalToken from "../internal/token.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import { oidc as logger } from "../logger.js";
import settingModel from "../models/setting.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/oidc
	 *
	 * OAuth Authorization Code flow initialisation
	 */
	.get(async (_req, res) => {
		try {
			const settings = await settingModel.query().where({ id: "oidc-config" }).first();
			const params = await getInitParams(settings);
			redirectToAuthorizationURL(res, params);
		} catch (err) {
			redirectWithError(res, err);
		}
	});

router
	.route("/callback")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/oidc/callback
	 *
	 * Oauth Authorization Code flow callback
	 */
	.get(async (req, res) => {
		try {
			const settings = await settingModel.query().where({ id: "oidc-config" }).first();
			const token = await validateCallback(req, settings);
			redirectWithJwtToken(res, token);
		} catch (err) {
			redirectWithError(res, err);
		}
	});

/**
 * Executes discovery and returns the configured `openid-client` client
 *
 * @param {Setting} settings
 * */
const getConfig = async (settings) => {
	return await client.discovery(new URL(settings.meta.issuerURL), settings.meta.clientID, settings.meta.clientSecret);
};

/**
 * Generates nonce, state and authorization url.
 *
 * @param {Setting} settings
 * @return { {String}, {String}, {String} } nonce, state and authorization url
 * */
const getInitParams = async (settings) => {
	const config = await getConfig(settings);

	const nonce = client.randomNonce();
	const state = client.randomState();

	const parameters = {
		redirect_uri: settings.meta.redirectURL,
		scope: "openid email",
		nonce: nonce,
		state: state,
	};

	const url = await client.buildAuthorizationUrl(config, parameters);

	return { url, nonce, state };
};

/**
 * Parses nonce, state and from cookie during the callback phase.
 *
 * @param {Request} req
 * @return { {String}, {String} } nonce and state
 * */
const parseValuesFromCookie = (req) => {
	if (!req.headers || !req.headers.cookie) {
		return { nonce: undefined, state: undefined };
	}
	let nonce;
	let state;
	if (req.cookies?.npmplus_oidc) {
		const val = req.cookies.npmplus_oidc.split("___");
		nonce = val[0].trim();
		state = val[1].trim();
	}

	return { nonce, state };
};

/**
 * Executes validation of callback parameters.
 *
 * @param {Request} req
 * @param {Setting} settings
 * @return {Promise} a promise resolving to a jwt token
 * */
const validateCallback = async (req, settings) => {
	const config = await getConfig(settings);
	const { nonce, state } = parseValuesFromCookie(req);
	const currentUrl = new URL(`${req.protocol}://${req.get("host")}${req.originalUrl}`);
	const tokens = await client.authorizationCodeGrant(config, currentUrl, {
		expectedNonce: nonce,
		expectedState: state,
	});
	const claims = tokens.claims();

	if (!claims.email) {
		throw new errs.AuthError("The Identity Provider didn't send the 'email' claim");
	}
	logger.info(`Successful authentication for email ${claims.email.toLowerCase()}`);

	return internalToken.getTokenFromOAuthClaim({ identity: claims.email.toLowerCase() });
};

const redirectToAuthorizationURL = (res, params) => {
	res.cookie("npmplus_oidc", `${params.nonce}___${params.state}`, { secure: true, sameSite: "Strict" });
	res.redirect(params.url);
};

const redirectWithJwtToken = (res, token) => {
	res.cookie("npmplus_oidc", `${token.token}---${token.expires}`, { secure: true, sameSite: "Strict" });
	res.redirect("/login");
};

const redirectWithError = (res, error) => {
	logger.error(`Callback error:  ${error.message}`);
	res.cookie("npmplus_oidc_error", error.message, { secure: true, sameSite: "Strict" });
	res.redirect("/login");
};

export default router;
