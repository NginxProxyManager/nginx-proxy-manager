import express from "express";
import internalToken from "../internal/token.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import createRateLimiter from "../lib/express/rate-limit.js";
import apiValidator from "../lib/validator/api.js";
import { debug, express as logger } from "../logger.js";
import { getValidationSchema } from "../schema/index.js";

// Two limits apply to logins. Per IP + target account: when the admin UI sits behind another
// proxy every client can resolve to the same IP, and an IP-only bucket at this size would let
// anyone lock out every user with a handful of bad logins.
const tokenRateLimiter = createRateLimiter({
	windowMs: 60 * 1000,
	max: 10,
	message: "Too many login attempts. Please try again in 1 minute.",
	skipSuccessfulRequests: true,
	keyGenerator: (req, clientIp) => {
		const identity = typeof req.body?.identity === "string" ? req.body.identity.trim().toLowerCase() : "";
		return `${clientIp}|${identity}`;
	},
});

// And per IP across all accounts, so one address can't spray passwords over many accounts at
// 10 a minute each. Only failures count. Behind a shared proxy this cap is shared by everyone
// using it, which is why it's higher than the per-account one.
const tokenIpRateLimiter = createRateLimiter({
	windowMs: 60 * 1000,
	max: 30,
	message: "Too many login attempts. Please try again in 1 minute.",
	skipSuccessfulRequests: true,
});

// Keyed on the user the challenge belongs to, not the challenge token itself, so fetching
// fresh challenge tokens doesn't reset the code-guessing budget. The payload is read without
// verifying the signature; verify2FA does that. A forged token only affects buckets for the
// sender's own IP.
const challengeUserId = (token) => {
	try {
		const payload = JSON.parse(Buffer.from(String(token).split(".")[1], "base64url").toString());
		return String(payload?.attrs?.id ?? "");
	} catch {
		return "";
	}
};

const twoFactorRateLimiter = createRateLimiter({
	windowMs: 60 * 1000,
	max: 10,
	message: "Too many login attempts. Please try again in 1 minute.",
	skipSuccessfulRequests: true,
	keyGenerator: (req, clientIp) => `${clientIp}|${challengeUserId(req.body?.challenge_token)}`,
});

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
	.post(tokenIpRateLimiter, tokenRateLimiter, async (req, res, next) => {
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
	.post(twoFactorRateLimiter, async (req, res, next) => {
		try {
			const { challenge_token, code } = await apiValidator(getValidationSchema("/tokens/2fa", "post"), req.body);
			const result = await internalToken.verify2FA(challenge_token, code);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
