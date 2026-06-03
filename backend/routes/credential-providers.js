import express from "express";
import internalCredentialProvider from "../internal/credential-provider.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import validator from "../lib/validator/index.js";
import { debug, express as logger } from "../logger.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

const providerBodySchema = {
	additionalProperties: false,
	properties: {
		name: { type: "string", minLength: 1 },
		type: { type: "string", enum: ["vault", "aws", "azure", "infisical", "http"] },
		oidc_issuer: { type: "string" },
		oidc_client_id: { type: "string" },
		oidc_client_secret: { type: "string" },
		oidc_audience: { type: "string" },
		oidc_scope: { type: "string" },
		meta: { type: "object" },
	},
};

router
	.route("/")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			res.status(200).send(await internalCredentialProvider.getAll(res.locals.access));
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})
	.post(async (req, res, next) => {
		try {
			const payload = await validator(
				{ ...providerBodySchema, required: ["name", "type", "oidc_issuer", "oidc_client_id", "oidc_client_secret"] },
				req.body,
			);
			const result = await internalCredentialProvider.create(res.locals.access, payload);
			res.status(201).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

router
	.route("/:provider_id")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			const result = await internalCredentialProvider.get(res.locals.access, {
				id: Number.parseInt(req.params.provider_id, 10),
			});
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})
	.put(async (req, res, next) => {
		try {
			const payload = await validator(providerBodySchema, req.body);
			payload.id = Number.parseInt(req.params.provider_id, 10);
			const result = await internalCredentialProvider.update(res.locals.access, payload);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})
	.delete(async (req, res, next) => {
		try {
			await internalCredentialProvider.delete(res.locals.access, {
				id: Number.parseInt(req.params.provider_id, 10),
			});
			res.status(200).send(true);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

router
	.route("/:provider_id/test")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.post(async (req, res, next) => {
		try {
			const result = await internalCredentialProvider.test(res.locals.access, {
				id: Number.parseInt(req.params.provider_id, 10),
			});
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

router
	.route("/:provider_id/test-resolve")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.post(async (req, res, next) => {
		try {
			const body = await validator(
				{
					additionalProperties: false,
					required: ["path"],
					properties: {
						path: { type: "string", minLength: 1 },
						field: { type: "string" },
					},
				},
				req.body,
			);
			const result = await internalCredentialProvider.testResolve(res.locals.access, {
				id: Number.parseInt(req.params.provider_id, 10),
				...body,
			});
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
