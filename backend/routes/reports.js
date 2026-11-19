import express from "express";
import internalReport from "../internal/report.js";
import internalTrafficStats from "../internal/traffic-stats.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import { debug, express as logger } from "../logger.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

router
	.route("/hosts")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /reports/hosts
	 */
	.get(async (req, res, next) => {
		try {
			const data = await internalReport.getHostsReport(res.locals.access);
			res.status(200).send(data);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

router
	.route("/traffic")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /reports/traffic?hours=24
	 */
	.get(async (req, res, next) => {
		try {
			const data = await internalTrafficStats.getReport(res.locals.access, {
				hours: req.query.hours,
				host_type: req.query.host_type,
				host_id: req.query.host_id,
			});
			res.status(200).send(data);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
