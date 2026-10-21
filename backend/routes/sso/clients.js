import express from "express";
import { debug, sso as logger } from "../../logger.js";
import internalSingleSignOnClient from "../../internal/sso-client.js";
import apiValidator from "../../lib/validator/api.js";
import validator from "../../lib/validator/index.js";
import { getValidationSchema } from "../../schema/index.js";
import jwtDecode from "../../lib/express/jwt-decode.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * /api/sso/clients
 *
 * Routes related to Single Sign On Clients management
 */
router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtDecode())

	/**
	 * GET /api/sso/clients
	 *
	 * Retrieve all SSO clients
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
			const rows = await internalSingleSignOnClient.getAll(res.locals.access, data.expand, data.query);
			res.status(200).send(rows);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * POST /api/sso/clients
	 *
	 * Create a new Single Sign On client
	 */
	.post(async (req, res, next) => {
		try {
			const data = { ...req.body };
			const payload = await apiValidator(getValidationSchema("/sso/clients", "post"), data);
			const result = await internalSingleSignOnClient.create(res.locals.access, payload);
			res.status(201).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * Specific SSO client
 *
 * /api/sso/clients/123
 */
router
	.route("/:client_id")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtDecode()) // preferred so it doesn't apply to nonexistent routes

	/**
	 * GET /api/sso/clients/123
	 *
	 * Retrieve a specific SSO client
	 */
	.get(async (req, res, next) => {
		try {
			const data = await validator(
				{
					required: ["client_id"],
					additionalProperties: false,
					properties: {
						client_id: {
							$ref: "common#/properties/id",
						},
						expand: {
							$ref: "common#/properties/expand",
						},
					},
				},
				{
					client_id: req.params.client_id,
					expand: typeof req.query.expand === "string" ? req.query.expand.split(",") : null,
				},
			);

			const row = await internalSingleSignOnClient.get(res.locals.access, {
				id: Number.parseInt(data.client_id, 10),
				expand: req.query.expand?.split?.(","),
			});
			res.status(200).send(row);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * PUT /api/sso/clients/123
	 *
	 * Update and existing SSO client
	 */
	.put(async (req, res, next) => {
		try {
			const payload = await apiValidator(getValidationSchema("/sso/clients/{clientID}", "put"), req.body);
			payload.id = Number.parseInt(req.params.client_id, 10);
			const result = await internalSingleSignOnClient.update(res.locals.access, payload);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * DELETE /api/sso/clients/123
	 *
	 * Delete an existing SSO client
	 */
	.delete(async (req, res, next) => {
		try {
			const result = await internalSingleSignOnClient.delete(res.locals.access, {
				id: Number.parseInt(req.params.client_id, 10),
			});
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * Disable specific SSO client
 *
 * /api/sso/clients/123/disable
 */
router
	.route("/:client_id/disable")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtDecode())
	.post(async (req, res, next) => {
		try {
			const result = await internalSingleSignOnClient.disable(res.locals.access, {
				id: Number.parseInt(req.params.client_id, 10),
			});
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * Enable specific SSO client
 *
 * /api/sso/clients/123/disable
 */
router
	.route("/:client_id/enable")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtDecode())
	.post(async (req, res, next) => {
		try {
			const result = await internalSingleSignOnClient.enable(res.locals.access, {
				id: Number.parseInt(req.params.client_id, 10),
			});
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
