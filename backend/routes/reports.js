import express from "express";
import internalReport from "../internal/report.js";
import jwtdecode from "../lib/express/jwt-decode.js";

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

	/**
	 * GET /reports/hosts
	 */
	.get(jwtdecode(), (_, res, next) => {
		internalReport
			.getHostsReport(res.locals.access)
			.then((data) => {
				res.status(200).send(data);
			})
			.catch(next);
	});

export default router;
