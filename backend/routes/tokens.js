import express from "express";
import internalToken from "../internal/token.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import apiValidator from "../lib/validator/api.js";
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
	.get(jwtdecode(), (req, res, next) => {
		internalToken
			.getFreshToken(res.locals.access, {
				expiry: typeof req.query.expiry !== "undefined" ? req.query.expiry : null,
				scope: typeof req.query.scope !== "undefined" ? req.query.scope : null,
			})
			.then((data) => {
				res.status(200).send(data);
			})
			.catch(next);
	})

	/**
	 * POST /tokens
	 *
	 * Create a new Token
	 */
	.post(async (req, res, next) => {
		apiValidator(getValidationSchema("/tokens", "post"), req.body)
			.then(internalToken.getTokenFromEmail)
			.then((data) => {
				res.status(200).send(data);
			})
			.catch(next);
	});

export default router;
