import fs from "node:fs";
import errs from "../lib/error.js";
import internalDeadHost from "./dead-host.js";
import internalProxyHost from "./proxy-host.js";
import internalRedirectionHost from "./redirection-host.js";
import internalStream from "./stream.js";

const SYSTEM_LOG_FILE = "/data/logs/backend.log";
const LETSENCRYPT_LOG_FILE = "/data/logs/letsencrypt.log";

// Matches the access_log/error_log paths written by the nginx templates
// (see backend/templates/{proxy_host,redirection_host,dead_host,stream}.conf).
// This is a fixed, server-side lookup table - a host log path is always derived
// from a validated `host_type` enum + numeric `host_id`, never from a client-supplied
// path or filename, so there is no path-traversal surface here.
const HOST_FILE_PREFIX = {
	proxy: "proxy-host",
	redirection: "redirection-host",
	dead: "dead-host",
	stream: "stream",
};

const DEFAULT_LINES = 200;
const MAX_LINES = 1000;
const CHUNK_SIZE = 64 * 1024;
// Never scan further back than this, regardless of how many lines were requested,
// so a huge or pathological log file can't turn a single request into unbounded I/O.
const MAX_SCAN_BYTES = 5 * 1024 * 1024;

/**
 * Reads at most `maxLines` lines from the end of a file, without loading the
 * whole file into memory. Reads backwards in fixed-size chunks until enough
 * newlines have been seen, the start of the file is reached, or the hard
 * MAX_SCAN_BYTES ceiling is hit.
 *
 * @param   {String} filePath
 * @param   {Number} maxLines
 * @returns {Promise<{lines: String[], size: Number, truncated: Boolean}>}
 */
const readLastLines = async (filePath, maxLines) => {
	let handle;
	try {
		handle = await fs.promises.open(filePath, "r");
		const stat = await handle.stat();
		const { size } = stat;

		if (size === 0) {
			return { lines: [], size: 0, truncated: false };
		}

		let position = size;
		let scanned = 0;
		let newlineCount = 0;
		const chunks = [];

		while (position > 0 && newlineCount <= maxLines && scanned < MAX_SCAN_BYTES) {
			const readSize = Math.min(CHUNK_SIZE, position);
			position -= readSize;
			const buffer = Buffer.alloc(readSize);
			await handle.read(buffer, 0, readSize, position);
			scanned += readSize;
			for (let i = buffer.length - 1; i >= 0; i--) {
				if (buffer[i] === 0x0a) newlineCount++;
			}
			chunks.unshift(buffer);
		}

		const truncated = position > 0 && scanned >= MAX_SCAN_BYTES;

		// If we didn't start reading from byte 0, the first line in our buffer is only
		// partial *unless* it happens that `position` landed exactly on a line boundary
		// (the byte right before it is a newline) - check that one byte to avoid
		// silently dropping a perfectly valid line.
		let startsOnLineBoundary = position === 0;
		if (position > 0) {
			const boundaryByte = Buffer.alloc(1);
			await handle.read(boundaryByte, 0, 1, position - 1);
			startsOnLineBoundary = boundaryByte[0] === 0x0a;
		}

		const text = Buffer.concat(chunks).toString("utf8");
		const allLines = text.split("\n");

		if (!startsOnLineBoundary && allLines.length > 0) {
			allLines.shift();
		}
		// Drop the trailing empty element caused by a final trailing newline.
		if (allLines.length > 0 && allLines[allLines.length - 1] === "") {
			allLines.pop();
		}

		return { lines: allLines.slice(-maxLines), size, truncated };
	} finally {
		if (handle) {
			await handle.close();
		}
	}
};

/**
 * Resolves a validated {type, host_type, host_id, channel} selection to the
 * fixed, absolute path of the log file on disk. Throws if the combination
 * isn't a recognised source.
 *
 * `channel` ("access" | "error") picks which of the two log files nginx writes
 * per host - it's deliberately not named "stream" to avoid confusion with the
 * "stream" host_type (TCP/UDP stream hosts).
 *
 * @param   {Object} data
 * @returns {String}
 */
const resolveFilePath = (data) => {
	switch (data.type) {
		case "system":
			return SYSTEM_LOG_FILE;
		case "letsencrypt":
			return LETSENCRYPT_LOG_FILE;
		case "host": {
			const prefix = HOST_FILE_PREFIX[data.host_type];
			if (!prefix || !data.host_id || !["access", "error"].includes(data.channel)) {
				throw new errs.ValidationError("Invalid host log source");
			}
			return `/data/logs/${prefix}-${data.host_id}_${data.channel}.log`;
		}
		default:
			throw new errs.ItemNotFoundError(data.type);
	}
};

/**
 * @param   {Array} rows
 * @returns {Array}
 */
const toHostOptions = (rows) =>
	rows.map((row) => ({
		id: row.id,
		label: Array.isArray(row.domain_names) ? row.domain_names.join(", ") : `Host #${row.id}`,
	}));

const internalLogViewer = {
	/**
	 * Lists the log sources available for the log viewer: the system (backend)
	 * log, the Let's Encrypt (certbot) log, and one entry per host the caller
	 * can see, for each host type.
	 *
	 * @param   {Access} access
	 * @returns {Promise}
	 */
	listSources: async (access) => {
		await access.can("logs:list");

		const [proxyHosts, redirectionHosts, deadHosts, streams] = await Promise.all([
			internalProxyHost.getAll(access),
			internalRedirectionHost.getAll(access),
			internalDeadHost.getAll(access),
			internalStream.getAll(access),
		]);

		return {
			system: { label: "System" },
			letsencrypt: { label: "Let's Encrypt" },
			hosts: {
				proxy: toHostOptions(proxyHosts),
				redirection: toHostOptions(redirectionHosts),
				dead: toHostOptions(deadHosts),
				stream: streams.map((row) => ({
					id: row.id,
					label: `Port ${row.incoming_port} → ${row.forward_ip}:${row.forwarding_port}`,
				})),
			},
		};
	},

	/**
	 * Returns the last N lines of the requested log source, optionally
	 * filtered by level and/or a plain-text search term.
	 *
	 * @param   {Access} access
	 * @param   {Object} data
	 * @param   {String} data.type        "system" | "letsencrypt" | "host"
	 * @param   {String} [data.host_type] "proxy" | "redirection" | "dead" | "stream"
	 * @param   {Number} [data.host_id]
	 * @param   {String} [data.channel]   "access" | "error"
	 * @param   {Number} [data.lines]
	 * @param   {String} [data.level]
	 * @param   {String} [data.search]
	 * @returns {Promise}
	 */
	tail: async (access, data) => {
		await access.can("logs:list");

		const filePath = resolveFilePath(data);
		const lines = Math.min(Math.max(data.lines || DEFAULT_LINES, 1), MAX_LINES);

		let result;
		try {
			result = await readLastLines(filePath, lines);
		} catch (err) {
			if (err.code === "ENOENT") {
				return { lines: [], size: 0, truncated: false, exists: false };
			}
			throw err;
		}

		let outputLines = result.lines;

		// Only the system log is written in our own "LEVEL   [scope]" format - level
		// filtering on nginx/certbot lines would just match nothing and look like an
		// empty log, so the filter is a no-op for any other source.
		if (data.type === "system" && data.level) {
			const needle = ` ${data.level.toUpperCase().padEnd(7)} `;
			outputLines = outputLines.filter((line) => line.includes(needle));
		}

		if (data.search) {
			const needle = data.search.toLowerCase();
			outputLines = outputLines.filter((line) => line.toLowerCase().includes(needle));
		}

		return {
			lines: outputLines,
			size: result.size,
			truncated: result.truncated,
			exists: true,
		};
	},
};

export default internalLogViewer;
