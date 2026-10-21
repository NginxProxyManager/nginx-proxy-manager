import express from "express";
import jwtdecode from "../../lib/express/jwt-decode.js";
import { sso as logger } from "../../logger.js";
import ssoClientModel from "../../models/sso_client.js";
import SingleSignOnClient from "../../models/sso_client.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * /api/sso/is-enabled
 *
 * Unauthenticated endpoint to check Single Sign On integration status
 */

router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/sso/is-enabled
	 *
	 * Returns the name of enabled SSO Clients if any
	 */
	.get(async (req, res, next) => {
		try {
			const data = await ssoClientModel
				.query()
				.whereIn("client_type", SingleSignOnClient.enabledProtocols)
				.andWhere({ is_deleted: 0, enabled: true });

			const response = {
				enabled: !!data,
				configs: data?.map((client) => ({ name: client.name, id: client.id })),
			};

			res.status(200).send(response);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
