import express from "express";
import internalSso from "../internal/sso.js";
import { debug, express as logger } from "../logger.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

router
	.route("/providers")
	.options((_, res) => {
		res.sendStatus(204);
	})
	/**
	 * GET /sso/providers
	 *
	 * Returns whether SSO is configured
	 */
	.get((req, res, next) => {
		try {
			res.status(200).send({
				oidc: internalSso.isConfigured()
			});
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

router
	.route("/login")
	.options((_, res) => {
		res.sendStatus(204);
	})
	/**
	 * GET /sso/login
	 *
	 * Redirects to the OIDC provider
	 */
	.get(async (req, res, next) => {
		try {
			if (!internalSso.isConfigured()) {
				return res.status(400).send("SSO not configured");
			}

			const { url, state, nonce } = await internalSso.getAuthorizationUrl();

			// Store state and nonce in cookies for validation in callback
			res.cookie("oidc_state", state, { httpOnly: true, maxAge: 15 * 60 * 1000 });
			res.cookie("oidc_nonce", nonce, { httpOnly: true, maxAge: 15 * 60 * 1000 });

			res.redirect(url);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

router
	.route("/callback")
	.options((_, res) => {
		res.sendStatus(204);
	})
	/**
	 * GET /sso/callback
	 *
	 * Handles callback from the OIDC provider
	 */
	.get(async (req, res, next) => {
		try {
			if (!internalSso.isConfigured()) {
				return res.status(400).send("SSO not configured");
			}

			const state = req.headers.cookie?.split('; ').find(row => row.startsWith('oidc_state='))?.split('=')[1];
			const nonce = req.headers.cookie?.split('; ').find(row => row.startsWith('oidc_nonce='))?.split('=')[1];

			if (!state || !nonce) {
				return res.status(400).send("Missing state or nonce from cookies");
			}

			// Clear cookies
			res.clearCookie("oidc_state");
			res.clearCookie("oidc_nonce");

			const fullUrl = req.protocol + "://" + req.get("host") + req.originalUrl;
			const tokenInfo = await internalSso.handleCallback(fullUrl, state, nonce);

			// Redirect to frontend with the token
			res.redirect(`/?sso_token=${tokenInfo.token}&sso_expires=${encodeURIComponent(tokenInfo.expires)}`);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			// Redirect to login with error
			res.redirect(`/?error=${encodeURIComponent(err.message)}`);
		}
	});

export default router;
