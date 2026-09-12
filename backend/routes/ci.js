import express from "express";
import fs from "node:fs/promises";
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

/**
 * /api/ci/mock-log
 *
 * Write mock log files in CI environment
 */
router
	.route("/mock-log")
	.options((_, res) => {
		res.sendStatus(204);
	})

	.post(async (req, res, next) => {
		try {
			const { hostId, type, content } = req.body;
			if (!hostId || !type || content === undefined) {
				return res.status(400).send({
					error: "Missing required fields: hostId, type, or content",
				});
			}

			const filePath = `/data/logs/proxy-host-${hostId}_${type}.log`;
			const dirPath = "/data/logs";

			await fs.mkdir(dirPath, { recursive: true });
			await fs.writeFile(filePath, content, "utf8");

			res.status(200).send(true);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
