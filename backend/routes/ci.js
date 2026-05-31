import express from "express";
import dnsPlugins from "../certbot/dns-plugins.json" with { type: "json" };
import { installPlugin } from "../lib/certbot.js";
import { debug, express as logger } from "../logger.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * ONLY AVAILABLE IN CI ENVIRONMENT!
 */

/**
 * /api/ci/certbot-plugins
 */
router
	.route("/certbot-plugins")
	.options((_, res) => {
		res.sendStatus(204);
	})

	// Return all certbot plugins
	.get(async (_req, res, _next) => {
		res.status(200).send(dnsPlugins);
	});

/**
 * /api/ci/certbot-plugins/{plugin}
 */
router
	.route("/certbot-plugins/:plugin")
	.options((_, res) => {
		res.sendStatus(204);
	})

	// Install a certbot plugin
	.post(async (req, res, next) => {
		try {
			const pluginName = req.params.plugin;
			// check if plugin exists
			if (!dnsPlugins[pluginName]) {
				return res.status(404).send({
					error: "Plugin not found",
				});
			}

			await installPlugin(pluginName);
			res.status(200).send(true);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
		return;
	});

export default router;
