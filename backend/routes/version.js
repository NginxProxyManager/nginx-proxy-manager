import express from "express";
import internalRemoteVersion from "../internal/remote-version.js";
import { debug, express as logger } from "../logger.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * /api/version/check
 */
router
	.route("/check")
	.options((_, res) => {
		res.sendStatus(204);
	})

	/**
	 * GET /api/version/check
	 *
	 * Check for available updates
	 */
	.get(async (req, res, _next) => {
		try {
			const data = await internalRemoteVersion.get();
			res.status(200).send(data);
		} catch (error) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${error}`);
			// Send 200 even though there's an error to avoid triggering update checks repeatedly
			res.status(200).send({
				current: null,
				latest: null,
				update_available: false,
			});
		}
	});

export default router;
