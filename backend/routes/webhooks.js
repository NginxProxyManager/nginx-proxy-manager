import express from "express";
import internalWebhook from "../internal/webhook.js";
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
			const rows = await internalWebhook.getAll(res.locals.access);
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
					required: ["name", "url", "events"],
					properties: {
						name: { type: "string", minLength: 1 },
						url: { type: "string", minLength: 1 },
						events: { type: "array", items: { type: "string" }, minItems: 1 },
						secret: { type: "string" },
						is_enabled: { type: "boolean" },
					},
				},
				req.body,
			);
			const result = await internalWebhook.create(res.locals.access, payload);
			res.status(201).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

router
	.route("/:webhook_id")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.delete(async (req, res, next) => {
		try {
			await internalWebhook.delete(res.locals.access, {
				id: Number.parseInt(req.params.webhook_id, 10),
			});
			res.status(200).send(true);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
