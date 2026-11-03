import express from "express";
import internalAuth from "../internal/auth.js";
import internalAuthProvider from "../internal/auth-provider.js";
import apiValidator from "../lib/validator/api.js";
import { auth as authLogger, debug, express as logger } from "../logger.js";
import { getValidationSchema } from "../schema/index.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * Sends the browser back to the frontend after a redirect based login.
 *
 * On success the frontend receives a single use code which it immediately
 * swaps for a real token; the token itself never travels in a URL, where it
 * would end up in browser history and access logs.
 */
const backToLogin = (res, params) => {
	const query = new URLSearchParams(params).toString();
	res.redirect(302, `/?${query}`);
};

/**
 * GET /api/auth/providers
 *
 * The sign in options for the login screen. Unauthenticated by design, so it
 * exposes provider names and nothing else.
 */
router
	.route("/providers")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.get(async (req, res, next) => {
		try {
			const options = await internalAuthProvider.getLoginOptions();
			res.status(200).send(options);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * POST /api/auth/exchange
 *
 * Swaps the single use code from a completed SSO login for an access token.
 */
router
	.route("/exchange")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.post(async (req, res, next) => {
		try {
			const payload = await apiValidator(getValidationSchema("/auth/exchange", "post"), req.body);
			const result = await internalAuth.exchange(payload.code);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * GET /api/auth/123/login
 *
 * Starts a SAML or OAuth login by redirecting to the identity provider.
 */
router
	.route("/:providerID/login")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.get(async (req, res, _next) => {
		try {
			const url = await internalAuth.startLogin(req, req.params.providerID);
			res.redirect(302, url);
		} catch (err) {
			authLogger.error(`Could not start login for provider ${req.params.providerID}: ${err.message}`);
			backToLogin(res, { sso_error: err.public ? err.message : "Could not start sign in" });
		}
	});

/**
 * GET|POST /api/auth/123/callback
 *
 * Where the identity provider sends the user back to. OAuth uses a GET with
 * query parameters, SAML posts the assertion form.
 */
const handleCallback = async (req, res) => {
	try {
		const code = await internalAuth.completeLogin(req, req.params.providerID);
		backToLogin(res, { sso_code: code });
	} catch (err) {
		authLogger.error(`Login callback failed for provider ${req.params.providerID}: ${err.message}`);
		backToLogin(res, { sso_error: err.public ? err.message : "Sign in failed" });
	}
};

router
	.route("/:providerID/callback")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.get(handleCallback)
	.post(handleCallback);

/**
 * GET /api/auth/123/metadata
 *
 * Service provider metadata for a SAML provider, to hand to the IdP.
 */
router
	.route("/:providerID/metadata")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.get(async (req, res, next) => {
		try {
			const xml = await internalAuth.getSamlMetadata(req, req.params.providerID);
			res.set("Content-Type", "application/xml");
			res.status(200).send(xml);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
