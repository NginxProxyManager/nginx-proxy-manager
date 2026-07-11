import express from "express";
import internalDnsProvider from "../../internal/dns-provider.js";
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
 * /api/nginx/dns-providers
 */
router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/nginx/dns-providers
	 *
	 * Retrieve all dns-providers
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
			const rows = await internalDnsProvider.getAll(res.locals.access, data.expand, data.query);
			res.status(200).send(rows);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * POST /api/nginx/dns-providers
	 *
	 * Create a new dns-provider
	 */
	.post(async (req, res, next) => {
		try {
			const payload = await apiValidator(getValidationSchema("/nginx/dns-providers", "post"), req.body);
			const result = await internalDnsProvider.create(res.locals.access, payload);
			res.status(201).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * Specific dns-provider
 *
 * /api/nginx/dns-providers/123
 */
router
	.route("/:provider_id")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/nginx/dns-providers/123
	 *
	 * Retrieve a specific dns-provider
	 */
	.get(async (req, res, next) => {
		try {
			const data = await validator(
				{
					required: ["provider_id"],
					additionalProperties: false,
					properties: {
						provider_id: {
							$ref: "common#/properties/id",
						},
						expand: {
							$ref: "common#/properties/expand",
						},
					},
				},
				{
					provider_id: req.params.provider_id,
					expand: typeof req.query.expand === "string" ? req.query.expand.split(",") : null,
				},
			);
			const row = await internalDnsProvider.get(res.locals.access, {
				id: Number.parseInt(data.provider_id, 10),
				expand: data.expand,
			});
			res.status(200).send(row);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * PUT /api/nginx/dns-providers/123
	 *
	 * Update and existing dns-provider
	 */
	.put(async (req, res, next) => {
		try {
			const payload = await apiValidator(getValidationSchema("/nginx/dns-providers/{providerID}", "put"), req.body);
			payload.id = Number.parseInt(req.params.provider_id, 10);
			const result = await internalDnsProvider.update(res.locals.access, payload);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * DELETE /api/nginx/dns-providers/123
	 *
	 * Delete and existing dns-provider
	 */
	.delete(async (req, res, next) => {
		try {
			const result = await internalDnsProvider.delete(res.locals.access, {
				id: Number.parseInt(req.params.provider_id, 10),
			});
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * Test dns-provider connection
 *
 * /api/nginx/dns-providers/123/test
 */
router
	.route("/:provider_id/test")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/nginx/dns-providers/123/test
	 *
	 * Test the connection for a specific dns-provider
	 */
	.get(async (req, res, next) => {
		try {
			const result = await internalDnsProvider.test(res.locals.access, {
				id: Number.parseInt(req.params.provider_id, 10),
			});
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
