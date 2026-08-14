import express from "express";
import internalUpstream from "../../internal/upstream.js";
import jwtdecode from "../../lib/express/jwt-decode.js";
import apiValidator from "../../lib/validator/api.js";
import validator from "../../lib/validator/index.js";
import { debug, express as logger } from "../../logger.js";
import { getValidationSchema } from "../../schema/index.js";

const router = express.Router({ caseSensitive: true, strict: true, mergeParams: true });
const sendError = (req, next) => (err) => {
	debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
	next(err);
};

router
	.route("/")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			const data = await validator(
				{ additionalProperties: false, properties: { expand: { $ref: "common#/properties/expand" }, query: { $ref: "common#/properties/query" } } },
				{ expand: typeof req.query.expand === "string" ? req.query.expand.split(",") : null, query: typeof req.query.query === "string" ? req.query.query : null },
			);
			res.status(200).send(await internalUpstream.getAll(res.locals.access, data.expand, data.query));
		} catch (err) { sendError(req, next)(err); }
	})
	.post(async (req, res, next) => {
		try {
			const payload = await apiValidator(getValidationSchema("/nginx/upstreams", "post"), req.body);
			res.status(201).send(await internalUpstream.create(res.locals.access, payload));
		} catch (err) { sendError(req, next)(err); }
	});

router.options("/nginx-config/preview", (_, res) => res.sendStatus(204));
router.post("/nginx-config/preview", jwtdecode(), async (req, res, next) => {
	try { res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }).status(200).send(await internalUpstream.previewNginxConfig(res.locals.access, req.body)); }
	catch (err) { sendError(req, next)(err); }
});

router
	.route("/:upstream_id/nginx-config")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			const id = Number.parseInt(req.params.upstream_id, 10);
			res.status(200).send(await internalUpstream.getNginxArtifacts(res.locals.access, id, typeof req.query.include_content === "string" ? req.query.include_content.split(",") : []));
		} catch (err) { sendError(req, next)(err); }
	});

router.options("/:upstream_id/publish", (_, res) => res.sendStatus(204));
router.post("/:upstream_id/publish", jwtdecode(), async (req, res, next) => {
	try { res.status(200).send(await internalUpstream.publish(res.locals.access, Number.parseInt(req.params.upstream_id, 10))); }
	catch (err) { sendError(req, next)(err); }
});

router.options("/:upstream_id/references", (_, res) => res.sendStatus(204));
router.get("/:upstream_id/references", jwtdecode(), async (req, res, next) => {
	try { res.status(200).send(await internalUpstream.getReferences(res.locals.access, Number.parseInt(req.params.upstream_id, 10))); }
	catch (err) { sendError(req, next)(err); }
});

router
	.route("/:upstream_id")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			const data = await validator(
				{ required: ["upstream_id"], additionalProperties: false, properties: { upstream_id: { $ref: "common#/properties/id" }, expand: { $ref: "common#/properties/expand" } } },
				{ upstream_id: req.params.upstream_id, expand: typeof req.query.expand === "string" ? req.query.expand.split(",") : null },
			);
			res.status(200).send(await internalUpstream.get(res.locals.access, { id: Number.parseInt(data.upstream_id, 10), expand: data.expand }));
		} catch (err) { sendError(req, next)(err); }
	})
	.put(async (req, res, next) => {
		try {
			const payload = await apiValidator(getValidationSchema("/nginx/upstreams/{upstreamID}", "put"), req.body);
			payload.id = Number.parseInt(req.params.upstream_id, 10);
			res.status(200).send(await internalUpstream.update(res.locals.access, payload));
		} catch (err) { sendError(req, next)(err); }
	})
	.delete(async (req, res, next) => {
		try { res.status(200).send(await internalUpstream.delete(res.locals.access, { id: Number.parseInt(req.params.upstream_id, 10) })); }
		catch (err) { sendError(req, next)(err); }
	});

export default router;
