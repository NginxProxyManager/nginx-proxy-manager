import express from "express";
import internalApiKey from "../internal/api-key.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import validator from "../lib/validator/index.js";
import { debug, express as logger } from "../logger.js";

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
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			const rows = await internalApiKey.getAll(res.locals.access);
			res.status(200).send(rows);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})
	.post(async (req, res, next) => {
		try {
			const payload = await validator(
				{
					additionalProperties: false,
					required: ["name"],
					properties: {
						name: { type: "string", minLength: 1, maxLength: 255 },
						permissions: { type: "object" },
						expires_on: { type: ["string", "null"] },
					},
				},
				req.body,
			);
			const result = await internalApiKey.create(res.locals.access, payload);
			res.status(201).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

router
	.route("/:api_key_id")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.delete(async (req, res, next) => {
		try {
			await internalApiKey.delete(res.locals.access, {
				id: Number.parseInt(req.params.api_key_id, 10),
			});
			res.status(200).send(true);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
