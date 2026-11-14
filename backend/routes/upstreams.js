import express from "express";
import internalUpstream from "../internal/upstream.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import { TooManyRequestsError } from "../lib/upstream/errors.js";
import apiValidator from "../lib/validator/api.js";
import { debug, express as logger } from "../logger.js";
import { getValidationSchema } from "../schema/index.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

const REQUEST_TIMEOUT_MS = 30000;

const handleError = (req, res, next, err) => {
	if (err instanceof TooManyRequestsError && err.retry_after) {
		res.set("Retry-After", `${err.retry_after}`);
	}
	debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
	next(err);
};

/**
 * /api/upstreams/candidates
 */
router
	.route("/candidates")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/upstreams/candidates?refresh=true
	 *
	 * Suggested forward hosts from Docker, the Docker embedded DNS and existing hosts
	 */
	.get(async (req, res, next) => {
		try {
			req.setTimeout(REQUEST_TIMEOUT_MS);
			const refresh = typeof req.query.refresh === "string" && /^(1|true|yes)$/i.test(req.query.refresh);
			const result = await internalUpstream.getCandidates(res.locals.access, { refresh });
			res.status(200).send(result);
		} catch (err) {
			handleError(req, res, next, err);
		}
	});

/**
 * /api/upstreams/check
 */
router
	.route("/check")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * POST /api/upstreams/check
	 *
	 * DNS + TCP reachability of up to 20 targets
	 */
	.post(async (req, res, next) => {
		try {
			req.setTimeout(REQUEST_TIMEOUT_MS);
			const payload = await apiValidator(getValidationSchema("/upstreams/check", "post"), req.body);
			const result = await internalUpstream.check(res.locals.access, payload);
			res.status(200).send(result);
		} catch (err) {
			handleError(req, res, next, err);
		}
	});

/**
 * /api/upstreams/health
 */
router
	.route("/health")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/upstreams/health
	 *
	 * Latest results of the background upstream health monitor
	 */
	.get(async (req, res, next) => {
		try {
			const result = await internalUpstream.getHealth(res.locals.access);
			res.status(200).send(result);
		} catch (err) {
			handleError(req, res, next, err);
		}
	});

export default router;
