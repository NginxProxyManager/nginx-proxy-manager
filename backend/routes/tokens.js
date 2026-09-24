import express from "express";
import internalToken from "../internal/token.js";
import internalWebauthn from "../internal/webauthn.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import apiValidator from "../lib/validator/api.js";
import { debug, express as logger } from "../logger.js";
import { getValidationSchema } from "../schema/index.js";

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

	/**
	 * GET /tokens
	 *
	 * Get a new Token, given they already have a token they want to refresh
	 * We also piggy back on to this method, allowing admins to get tokens
	 * for services like Job board and Worker.
	 */
	.get(jwtdecode(), async (req, res, next) => {
		try {
			const data = await internalToken.getFreshToken(res.locals.access, {
				expiry: typeof req.query.expiry !== "undefined" ? req.query.expiry : null,
				scope: typeof req.query.scope !== "undefined" ? req.query.scope : null,
			});
			res.status(200).send(data);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * POST /tokens
	 *
	 * Create a new Token
	 */
	.post(async (req, res, next) => {
		try {
			const data = await apiValidator(getValidationSchema("/tokens", "post"), req.body);
			const result = await internalToken.getTokenFromEmail(data);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

router
	.route("/2fa")
	.options((_, res) => {
		res.sendStatus(204);
	})

	/**
	 * POST /tokens/2fa
	 *
	 * Verify 2FA code and get full token
	 */
	.post(async (req, res, next) => {
		try {
			const { challenge_token, code } = await apiValidator(getValidationSchema("/tokens/2fa", "post"), req.body);
			const result = await internalToken.verify2FA(challenge_token, code);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

router
	.route("/passkey/options")
	.options((_, res) => {
		res.sendStatus(204);
	})

	/**
	 * POST /tokens/passkey/options
	 *
	 * Generate passkey authentication options
	 */
	.post(async (req, res, next) => {
		try {
			const data = await apiValidator(getValidationSchema("/tokens/passkey/options", "post"), req.body);
			const result = await internalWebauthn.generateAuthOptions(data.email || null, req);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

router
	.route("/passkey/verify")
	.options((_, res) => {
		res.sendStatus(204);
	})

	/**
	 * POST /tokens/passkey/verify
	 *
	 * Verify passkey authentication and get full token
	 */
	.post(async (req, res, next) => {
		try {
			const data = await apiValidator(getValidationSchema("/tokens/passkey/verify", "post"), req.body);
			const credential = JSON.parse(data.credential);
			const result = await internalToken.getTokenFromPasskey(data.challenge_token, credential, undefined, req);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
