import fs from "node:fs/promises";
import express from "express";
import moment from "moment";
import jwtdecode from "../../lib/express/jwt-decode.js";
import errs from "../../lib/error.js";
import validator from "../../lib/validator/index.js";
import { debug, express as logger } from "../../logger.js";
import internalProxyHost from "../../internal/proxy-host.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

function parseLogLineTime(line, type) {
	if (type === "access") {
		const match = line.match(/^\[([^\]]+)\]/);
		if (match) {
			const m = moment(match[1], "DD/MMM/YYYY:HH:mm:ss ZZ");
			if (m.isValid()) {
				return m;
			}
		}
	} else if (type === "error") {
		const match = line.match(/^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})/);
		if (match) {
			const m = moment(match[1], "YYYY/MM/DD HH:mm:ss");
			if (m.isValid()) {
				return m;
			}
		}
	}
	return null;
}

async function readLastLines({ filePath, maxLines, search, since, type }) {
	const chunkSize = 64 * 1024; // 64KB
	const lines = [];
	let fileHandle = null;

	try {
		fileHandle = await fs.open(filePath, "r");
		const stat = await fileHandle.stat();
		const fileSize = stat.size;

		let position = fileSize;
		const buffer = Buffer.alloc(chunkSize);
		let leftover = "";

		const sinceTime = since ? moment(since) : null;
		while (position > 0 && lines.length < maxLines) {
			const readSize = Math.min(chunkSize, position);
			position -= readSize;

			const { bytesRead } = await fileHandle.read(buffer, 0, readSize, position);
			const chunkStr = buffer.toString("utf8", 0, bytesRead) + leftover;

			const chunkLines = chunkStr.split(/\r?\n/);
			// The first line of chunkLines is incomplete because it was cut in the middle of a line,
			// unless position was 0. So we store it as leftover.
			if (position > 0) {
				leftover = chunkLines.shift();
			} else {
				leftover = "";
			}

			// We process the chunkLines backwards
			for (let i = chunkLines.length - 1; i >= 0; i--) {
				const line = chunkLines[i];
				if (!line && i === chunkLines.length - 1 && position + readSize === fileSize) {
					// Skip trailing empty line at the very end of the file
					continue;
				}

				// Check since timestamp if provided
				if (sinceTime) {
					const lineTime = parseLogLineTime(line, type);
					if (lineTime) {
						if (lineTime.isBefore(sinceTime)) {
							// Since log lines are chronologically ordered, we can stop reading
							// once we find a line with a timestamp before 'sinceTime'.
							return lines;
						}
					}
				}

				// Check search filter if provided
				if (search && !line.includes(search)) {
					continue;
				}

				lines.unshift(line);
				if (lines.length >= maxLines) {
					break;
				}
			}
		}

		// If we reached the beginning of the file and there's a leftover, process it
		if (leftover && lines.length < maxLines) {
			if (sinceTime) {
				const lineTime = parseLogLineTime(leftover, type);
				if (lineTime?.isBefore(sinceTime)) {
					return lines;
				}
			}
			if (!search || leftover.includes(search)) {
				lines.unshift(leftover);
			}
		}
	} finally {
		if (fileHandle) {
			await fileHandle.close();
		}
	}

	return lines;
}

/**
 * /api/nginx/proxy-hosts/:host_id/logs
 */
router
	.route("/:host_id/logs")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/nginx/proxy-hosts/:host_id/logs
	 *
	 * Retrieve log lines for a specific proxy host
	 */
	.get(async (req, res, next) => {
		try {
			const payload = {
				host_id: req.params.host_id,
				type: req.query.type || "access",
				lines: req.query.lines !== undefined ? Number.parseInt(req.query.lines, 10) : 100,
			};
			if (req.query.search !== undefined) {
				payload.search = req.query.search;
			}
			if (req.query.since !== undefined) {
				payload.since = req.query.since;
			}

			const data = await validator(
				{
					required: ["host_id"],
					additionalProperties: false,
					properties: {
						host_id: {
							$ref: "common#/properties/id",
						},
						type: {
							type: "string",
							enum: ["access", "error"],
							default: "access",
						},
						lines: {
							type: "integer",
							minimum: 1,
							maximum: 1000,
							default: 100,
						},
						search: {
							type: "string",
						},
						since: {
							type: "string",
						},
					},
				},
				payload,
			);

			if (data.since && !moment(data.since).isValid()) {
				throw new errs.ValidationError("Invalid since timestamp format. Must be ISO 8601.");
			}

			const hostId = Number.parseInt(data.host_id, 10);
			// Call internalProxyHost helper to handle permissions and retrieve host
			await internalProxyHost.getHostForLogs(res.locals.access, hostId);

			const filePath = `/data/logs/proxy-host-${hostId}_${data.type}.log`;

			// Check if file exists, if not throw 404
			try {
				await fs.stat(filePath);
			} catch (err) {
				if (err.code === "ENOENT") {
					throw new errs.ItemNotFoundError(`Log file not found for host ${hostId} (${data.type})`);
				}
				throw err;
			}

			const matchedLines = await readLastLines({
				filePath,
				maxLines: data.lines,
				search: data.search,
				since: data.since,
				type: data.type,
			});

			res.status(200).send({
				host_id: hostId,
				log_type: data.type,
				returned_lines: matchedLines.length,
				lines: matchedLines,
			});
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
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

			// Check access log exists, throw 404 if missing
			let access_log_size_bytes = 0;
			try {
				const stat = await fs.stat(accessLogPath);
				access_log_size_bytes = stat.size;
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

			const accessLines = await readLastLines({
				filePath: accessLogPath,
				maxLines: 1000,
				type: "access",
			});

			const status_codes = {};
			const pathsMap = {};
			const clientsMap = {};
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
