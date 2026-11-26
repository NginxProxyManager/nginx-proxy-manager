import fs from "node:fs/promises";
import express from "express";
import { readLastLines } from "../../internal/log-viewer.js";
import internalProxyHost from "../../internal/proxy-host.js";
import errs from "../../lib/error.js";
import jwtdecode from "../../lib/express/jwt-decode.js";
import validator from "../../lib/validator/index.js";
import { debug, express as logger } from "../../logger.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * /api/nginx/proxy-hosts/:host_id/logs/summary
 */
router
	.route("/:host_id/logs/summary")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/nginx/proxy-hosts/:host_id/logs/summary
	 *
	 * Retrieve statistics summary for a specific proxy host's access log
	 */
	.get(async (req, res, next) => {
		try {
			const data = await validator(
				{
					required: ["host_id"],
					additionalProperties: false,
					properties: {
						host_id: {
							$ref: "common#/properties/id",
						},
					},
				},
				{
					host_id: req.params.host_id,
				},
			);

			const hostId = Number.parseInt(data.host_id, 10);
			// Call internalProxyHost helper to handle permissions and retrieve host
			await internalProxyHost.getHostForLogs(res.locals.access, hostId);

			const accessLogPath = `/data/logs/proxy-host-${hostId}_access.log`;
			const errorLogPath = `/data/logs/proxy-host-${hostId}_error.log`;

			// Read last 1000 lines and size from access log, throw 404 if missing
			let accessLines;
			let access_log_size_bytes = 0;
			try {
				const accessResult = await readLastLines(accessLogPath, 1000);
				accessLines = accessResult.lines;
				access_log_size_bytes = accessResult.size;
			} catch (err) {
				if (err.code === "ENOENT") {
					throw new errs.ItemNotFoundError(`Access log file not found for host ${hostId}`);
				}
				throw err;
			}

			// Get error log size, if missing default to 0
			let error_log_size_bytes = 0;
			try {
				const stat = await fs.stat(errorLogPath);
				error_log_size_bytes = stat.size;
			} catch (err) {
				if (err.code !== "ENOENT") {
					throw err;
				}
			}

			// Null-prototype maps so log-derived keys ("constructor", "__proto__", ...)
			// cannot collide with Object.prototype members.
			const status_codes = Object.create(null);
			const pathsMap = Object.create(null);
			const clientsMap = Object.create(null);
			let cacheHits = 0;
			let cacheableCount = 0;

			const regex = /^\[([^\]]+)\] (\S+) (\S+) (\d{3}) - (\S+) (\S+) (\S+) "([^"]+)" \[Client ([^\]]+)\]/;

			for (const line of accessLines) {
				const match = line.match(regex);
				if (!match) continue;

				const cacheStatus = match[2];
				const status = match[4];
				const requestUri = match[8];
				const clientIp = match[9];

				// Status codes
				status_codes[status] = (status_codes[status] || 0) + 1;

				// Paths
				const path = requestUri.split("?")[0];
				pathsMap[path] = (pathsMap[path] || 0) + 1;

				// Clients
				clientsMap[clientIp] = (clientsMap[clientIp] || 0) + 1;

				// Cache hit rate
				if (cacheStatus !== "-") {
					cacheableCount++;
					if (cacheStatus === "HIT" || cacheStatus === "REVALIDATED") {
						cacheHits++;
					}
				}
			}

			const cache_hit_rate =
				cacheableCount > 0 ? Number.parseFloat((cacheHits / cacheableCount).toFixed(4)) : 0.0;

			const top_paths = Object.entries(pathsMap)
				.map(([path, count]) => ({ path, count }))
				.sort((a, b) => b.count - a.count)
				.slice(0, 10);

			const top_clients = Object.entries(clientsMap)
				.map(([client, count]) => ({ client, count }))
				.sort((a, b) => b.count - a.count)
				.slice(0, 10);

			res.status(200).send({
				host_id: hostId,
				period: "last_1000_lines",
				status_codes,
				top_paths,
				top_clients,
				cache_hit_rate,
				access_log_size_bytes,
				error_log_size_bytes,
			});
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
