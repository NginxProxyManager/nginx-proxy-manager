import express from "express";
import internalBackup from "../internal/backup.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import { debug, backup as logger } from "../logger.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * Export Configuration
 *
 * GET /api/backup/export
 */
router
	.route("/export")
	.options((_req, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			req.setTimeout(300000); // 5 minutes timeout for large exports
			const password = req.query.password || null;
			const result = await internalBackup.exportAll(res.locals.access, password);
			res.status(200).download(result.fileName);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * Import Configuration
 *
 * POST /api/backup/import
 */
router
	.route("/import")
	.options((_req, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.post(async (req, res, next) => {
		if (!req.files || !req.files.backup) {
			res.status(400).send({ error: { message: "No backup file uploaded" } });
			return;
		}

		try {
			req.setTimeout(600000); // 10 minutes timeout for large imports
			const password = req.body.password || null;
			const result = await internalBackup.importAll(res.locals.access, req.files.backup, password);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
