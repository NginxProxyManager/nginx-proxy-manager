import express from "express";
import internalToken from "../internal/token.js";
import errs from "../lib/error.js";
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

			res.cookie("token", data.token, {
				httpOnly: true,
				secure: true,
				sameSite: "lax",
				path: "/api",
				expires: new Date(data.expires),
			});

			res.status(200).send({ expires: data.expires });
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.originalUrl}: ${err}`);
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
			if (process.env.OIDC_DISABLE_PASSWORD === "true") {
				throw new errs.AuthError("Non OIDC login is disabled");
			}

			const data = await apiValidator(getValidationSchema("/tokens", "post"), req.body);
			const result = await internalToken.getTokenFromEmail(data);
			const { token, ...responseBody } = result;

			if (result.token && result.expires) {
				res.cookie("token", result.token, {
					httpOnly: true,
					secure: true,
					sameSite: "lax",
					path: "/api",
					expires: new Date(result.expires),
				});
			}

			res.status(200).send(responseBody);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.originalUrl}: ${err}`);
			next(err);
		}
	})

	/**
	 * DELETE /tokens
	 *
	 * Delete the Token
	 */
	.delete(async (req, res, next) => {
		try {
			res.clearCookie("token", { path: "/api" });
			res.status(200).send(true);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.originalUrl}: ${err}`);
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
			if (process.env.OIDC_DISABLE_PASSWORD === "true") {
				throw new errs.AuthError("Non OIDC login is disabled");
			}

			const { challenge_token, code } = await apiValidator(getValidationSchema("/tokens/2fa", "post"), req.body);
			const result = await internalToken.verify2FA(challenge_token, code);
			const { token, ...responseBody } = result;

			if (result.token && result.expires) {
				res.cookie("token", result.token, {
					httpOnly: true,
					secure: true,
					sameSite: "lax",
					path: "/api",
					expires: new Date(result.expires),
				});
			}

			res.status(200).send(responseBody);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
