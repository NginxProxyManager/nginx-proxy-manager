import express from "express";
import jwtdecode from "../../lib/express/jwt-decode.js";
import { getAuth0InitParams, validateAuth0Callback } from "../../lib/sso/auth0.js";
import { getGitHubInitParams, validateGitHubCallback } from "../../lib/sso/github.js";
import { redirectToAuthorizationURL, redirectWithError, redirectWithJwtToken } from "../../lib/sso/lib.js";
import { getOpenIDInitParams, validateOpenIDCallback } from "../../lib/sso/openid.js";
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
	.route("/openid/:client_id")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/sso/oauth2/openid/123
	 *
	 * Initialize flow for specific SSO Client
	 */
	.get(async (req, res) => {
		logger.info(`[${req.params.client_id}] Initializing OAuth flow`);
		ssoClientModel
			.query()
			.where({ is_deleted: 0, enabled: 1, id: req.params.client_id })
			.withGraphFetched("[configuration_openid]")
			.first()
			.then((row) => getOpenIDInitParams(req, row))
			.then((params) => redirectToAuthorizationURL(res, params))
			.catch((err) => redirectWithError(res, err));
	});

router
	.route("/openid/:client_id/callback")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/sso/oauth2/openid/123/callback
	 *
	 * Flow callback phase for specific SSO Client
	 */
	.get(async (req, res) => {
		logger.info(`[${req.params.client_id}] Processing callback`);
		ssoClientModel
			.query()
			.where({ is_deleted: 0, enabled: 1, id: req.params.client_id })
			.withGraphFetched("[configuration_openid]")
			.first()
			.then((config) => validateOpenIDCallback(req, config))
			.then((token) => redirectWithJwtToken(res, token))
			.catch((err) => redirectWithError(res, err));
	});

/**
 * /api/sso/oauth2/auth0
 *
 * Routes related to OAuth Authorization Code Flow (Auth0)
 */

router
	.route("/auth0/:client_id")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/sso/oauth2/auth0/123
	 *
	 * Initialize flow for specific SSO Client
	 */
	.get(async (req, res) => {
		logger.info(`[${req.params.client_id}] Initializing OAuth flow`);
		ssoClientModel
			.query()
			.where({ is_deleted: 0, enabled: 1, id: req.params.client_id })
			.withGraphFetched("[configuration_auth0]")
			.first()
			.then((row) => getAuth0InitParams(req, row))
			.then((params) => redirectToAuthorizationURL(res, params))
			.catch((err) => redirectWithError(res, err));
	});

router
	.route("/auth0/:client_id/callback")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/sso/oauth2/auth0/123/callback
	 *
	 * Flow callback phase for specific SSO Client
	 */
	.get(async (req, res) => {
		logger.info(`[${req.params.client_id}] Processing callback`);
		ssoClientModel
			.query()
			.where({ is_deleted: 0, enabled: 1, id: req.params.client_id })
			.withGraphFetched("[configuration_auth0]")
			.first()
			.then((config) => validateAuth0Callback(req, config))
			.then((token) => redirectWithJwtToken(res, token))
			.catch((err) => redirectWithError(res, err));
	});

/**
 * /api/sso/oauth2/github
 *
 * Routes related to OAuth Authorization Code Flow (GitHub)
 */

router
	.route("/github/:client_id")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/sso/oauth2/github/123
	 *
	 * Initialize flow for specific SSO Client
	 */
	.get(async (req, res) => {
		logger.info(`[${req.params.client_id}] Initializing OAuth flow`);
		ssoClientModel
			.query()
			.where({ is_deleted: 0, enabled: 1, id: req.params.client_id })
			.withGraphFetched("[configuration_github]")
			.first()
			.then((row) => getGitHubInitParams(req, row))
			.then((params) => redirectToAuthorizationURL(res, params))
			.catch((err) => redirectWithError(res, err));
	});

router
	.route("/github/:client_id/callback")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/sso/oauth2/github/123/callback
	 *
	 * Flow callback phase for specific SSO Client
	 */
	.get(async (req, res) => {
		logger.info(`[${req.params.client_id}] Processing callback`);
		ssoClientModel
			.query()
			.where({ is_deleted: 0, enabled: 1, id: req.params.client_id })
			.withGraphFetched("[configuration_github]")
			.first()
			.then((config) => validateGitHubCallback(req, config))
			.then((token) => redirectWithJwtToken(res, token))
			.catch((err) => redirectWithError(res, err));
	});

export default router;
