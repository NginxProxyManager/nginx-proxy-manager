import express from "express";
import internalNginxRegenerate from "../../internal/nginx-regenerate.js";
import jwtdecode from "../../lib/express/jwt-decode.js";
import apiValidator from "../../lib/validator/api.js";
import { debug, express as logger } from "../../logger.js";
import { getValidationSchema } from "../../schema/index.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

// Every host goes through nginx -t (and DNS lookups for custom locations), this can take minutes
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * /api/nginx/regenerate
 */
router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * POST /api/nginx/regenerate
	 *
	 * Rewrites the config files of all enabled hosts from the database and reloads nginx once
	 */
	.post(async (req, res, next) => {
		try {
			req.setTimeout(REQUEST_TIMEOUT_MS);
			res.setTimeout(REQUEST_TIMEOUT_MS);
			const payload = await apiValidator(getValidationSchema("/nginx/regenerate", "post"), req.body || {});
			const result = await internalNginxRegenerate.regenerate(res.locals.access, payload);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
