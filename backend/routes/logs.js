import express from "express";
import internalLogViewer from "../internal/log-viewer.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import validator from "../lib/validator/index.js";
import { debug, express as logger } from "../logger.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * /api/logs/sources
 */
router
	.route("/sources")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/logs/sources
	 *
	 * Lists the log sources available for the log viewer
	 */
	.get(async (req, res, next) => {
		try {
			const data = await internalLogViewer.listSources(res.locals.access);
			res.status(200).send(data);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * /api/logs/tail
 */
router
	.route("/tail")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/logs/tail
	 *
	 * Retrieve the last N lines of a log source
	 */
	.get(async (req, res, next) => {
		try {
			const data = await validator(
				{
					required: ["type"],
					additionalProperties: false,
					properties: {
						type: {
							type: "string",
							enum: ["system", "letsencrypt", "host"],
						},
						host_type: {
							anyOf: [{ type: "null" }, { type: "string", enum: ["proxy", "redirection", "dead", "stream"] }],
						},
						host_id: {
							anyOf: [{ type: "null" }, { type: "integer", minimum: 1 }],
						},
						channel: {
							anyOf: [{ type: "null" }, { type: "string", enum: ["access", "error"] }],
						},
						lines: {
							anyOf: [{ type: "null" }, { type: "integer", minimum: 1, maximum: 1000 }],
						},
						level: {
							anyOf: [
								{ type: "null" },
								{ type: "string", enum: ["INFO", "WARN", "ERROR", "DEBUG", "SUCCESS", "FATAL", "COMPLETE"] },
							],
						},
						search: {
							anyOf: [{ type: "null" }, { type: "string", minLength: 1, maxLength: 200 }],
						},
					},
				},
				{
					type: req.query.type,
					host_type: typeof req.query.host_type === "string" ? req.query.host_type : null,
					host_id: typeof req.query.host_id !== "undefined" ? req.query.host_id : null,
					channel: typeof req.query.channel === "string" ? req.query.channel : null,
					lines: typeof req.query.lines !== "undefined" ? req.query.lines : null,
					level: typeof req.query.level === "string" ? req.query.level : null,
					search: typeof req.query.search === "string" ? req.query.search : null,
				},
			);

			const result = await internalLogViewer.tail(res.locals.access, data);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
