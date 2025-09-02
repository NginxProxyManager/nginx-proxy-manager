import express from "express";
import internalAuditLog from "../internal/audit-log.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import validator from "../lib/validator/index.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * /api/audit-log
 */
router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/audit-log
	 *
	 * Retrieve all logs
	 */
	.get((req, res, next) => {
		validator(
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
		)
			.then((data) => {
				return internalAuditLog.getAll(res.locals.access, data.expand, data.query);
			})
			.then((rows) => {
				res.status(200).send(rows);
			})
			.catch(next);
	});

export default router;
