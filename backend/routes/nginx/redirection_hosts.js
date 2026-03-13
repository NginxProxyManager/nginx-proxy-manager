import express from "express";
import internalRedirectionHost from "../../internal/redirection-host.js";
import jwtdecode from "../../lib/express/jwt-decode.js";
import apiValidator from "../../lib/validator/api.js";
import validator from "../../lib/validator/index.js";
import { debug, express as logger } from "../../logger.js";
import { getValidationSchema } from "../../schema/index.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * /api/nginx/redirection-hosts
 */
router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/nginx/redirection-hosts
	 *
	 * Retrieve all redirection-hosts
	 */
	.get(async (req, res, next) => {
		try {
			const data = await validator(
				{
					additionalProperties: false,
					properties: {
						expand: {
							$ref: "common#/properties/expand",
						},
						query: {
							$ref: "common#/properties/query",
						},
					},
				},
				{
					expand: typeof req.query.expand === "string" ? req.query.expand.split(",") : null,
					query: typeof req.query.query === "string" ? req.query.query : null,
				},
			);
			const rows = await internalRedirectionHost.getAll(res.locals.access, data.expand, data.query);
			res.status(200).send(rows);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * POST /api/nginx/redirection-hosts
	 *
	 * Create a new redirection-host
	 */
	.post(async (req, res, next) => {
		try {
			const payload = await apiValidator(getValidationSchema("/nginx/redirection-hosts", "post"), req.body);
			const result = await internalRedirectionHost.create(res.locals.access, payload);
			res.status(201).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * Specific redirection-host
 *
 * /api/nginx/redirection-hosts/123
 */
router
	.route("/:host_id")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/nginx/redirection-hosts/123
	 *
	 * Retrieve a specific redirection-host
	 */
	.get(async (req, res, next) => {
		try {
			const data = await validator(
				{
					required: ["host_id"],
					additionalProperties: false,
					properties: {
						host_id: {
							$ref: "common#/properties/id",
						},
						expand: {
							$ref: "common#/properties/expand",
						},
					},
				},
				{
					host_id: req.params.host_id,
					expand: typeof req.query.expand === "string" ? req.query.expand.split(",") : null,
				},
			);
			const row = await internalRedirectionHost.get(res.locals.access, {
				id: Number.parseInt(data.host_id, 10),
				expand: data.expand,
			});
			res.status(200).send(row);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * PUT /api/nginx/redirection-hosts/123
	 *
	 * Update and existing redirection-host
	 */
	.put(async (req, res, next) => {
		try {
			const payload = await apiValidator(
				getValidationSchema("/nginx/redirection-hosts/{hostID}", "put"),
				req.body,
			);
			payload.id = Number.parseInt(req.params.host_id, 10);
			const result = await internalRedirectionHost.update(res.locals.access, payload);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * DELETE /api/nginx/redirection-hosts/123
	 *
	 * Update and existing redirection-host
	 */
	.delete(async (req, res, next) => {
		try {
			const result = await internalRedirectionHost.delete(res.locals.access, {
				id: Number.parseInt(req.params.host_id, 10),
			});
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * Enable redirection-host
 *
 * /api/nginx/redirection-hosts/123/enable
 */
router
	.route("/:host_id/enable")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * POST /api/nginx/redirection-hosts/123/enable
	 */
	.post(async (req, res, next) => {
		try {
			const result = await internalRedirectionHost.enable(res.locals.access, {
				id: Number.parseInt(req.params.host_id, 10),
			});
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * Disable redirection-host
 *
 * /api/nginx/redirection-hosts/123/disable
 */
router
	.route("/:host_id/disable")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * POST /api/nginx/redirection-hosts/123/disable
	 */
	.post(async (req, res, next) => {
		try {
			const result = await internalRedirectionHost.disable(res.locals.access, {
				id: Number.parseInt(req.params.host_id, 10),
			});
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
