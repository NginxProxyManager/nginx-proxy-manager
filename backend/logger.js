import fs from "node:fs";
import path from "node:path";
import signale from "signale";
import { isDebugMode } from "./lib/config.js";

const opts = {
	logLevel: "info",
};

// Methods that are actually used across the codebase (see grep of `.info(`, `.warn(`, etc).
// Only these are mirrored to the log file - decorative signale methods (star, note, watch, ...)
// are left console-only since they carry no diagnostic value worth persisting.
const PERSISTED_METHODS = ["info", "warn", "error", "debug", "success", "fatal", "complete"];

const LOG_FILE = "/data/logs/backend.log";
// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI colour codes before writing to disk
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

let fileStream = null;
let lastOpenAttempt = 0;
// If the file can't be opened (eg. running outside the standard Docker image, or in
// CI without /data), don't retry on every single log call - but do retry periodically
// so a transient issue (disk full, permissions fixed later) recovers without a restart.
const REOPEN_COOLDOWN_MS = 30 * 1000;

/**
 * Lazily opens the backend log file for appending. If the directory isn't writable,
 * file logging is silently disabled and console logging continues unaffected.
 *
 * @returns {import('node:fs').WriteStream|null}
 */
const getFileStream = () => {
	if (fileStream) {
		return fileStream;
	}

	const now = Date.now();
	if (now - lastOpenAttempt < REOPEN_COOLDOWN_MS) {
		return null;
	}
	lastOpenAttempt = now;

	try {
		fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
		const stream = fs.createWriteStream(LOG_FILE, { flags: "a" });
		stream.on("error", () => {
			fileStream = null;
		});
		fileStream = stream;
	} catch (_err) {
		fileStream = null;
	}
	return fileStream;
};

/**
 * Formats and appends a single log line to the backend log file.
 * Never throws - a failure here must never take down the application.
 *
 * @param {String} level
 * @param {String} scope
 * @param {Array}  args
 */
const writeToFile = (level, scope, args) => {
	const stream = getFileStream();
	if (!stream) {
		return;
	}

	const message = args
		.map((arg) => {
			if (typeof arg === "string") return arg;
			if (arg instanceof Error) return arg.stack || arg.message;
			try {
				return JSON.stringify(arg);
			} catch (_err) {
				return String(arg);
			}
		})
		.join(" ")
		.replace(ANSI_PATTERN, "");

	const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(7)} [${scope.trim()}] ${message}\n`;
	stream.write(line);
};

/**
 * Wraps a Signale instance so that every call to one of PERSISTED_METHODS is also
 * appended to the backend log file, in addition to its normal console output.
 *
 * @param   {Signale} instance
 * @param   {String}  scope
 * @returns {Signale}
 */
const withFileSink = (instance, scope) => {
	for (const method of PERSISTED_METHODS) {
		const original = instance[method].bind(instance);
		instance[method] = (...args) => {
			writeToFile(method, scope, args);
			return original(...args);
		};
	}
	return instance;
};

const createLogger = (scope) => withFileSink(new signale.Signale({ scope, ...opts }), scope);

const global = createLogger("Global   ");
const migrate = createLogger("Migrate  ");
const express = createLogger("Express  ");
const access = createLogger("Access   ");
const auth = createLogger("Auth     ");
const nginx = createLogger("Nginx    ");
const ssl = createLogger("SSL      ");
const certbot = createLogger("Certbot  ");
const importer = createLogger("Importer ");
const setup = createLogger("Setup    ");
const ipRanges = createLogger("IP Ranges");
const remoteVersion = createLogger("Remote Version");

const debug = (logger, ...args) => {
	if (isDebugMode()) {
		logger.debug(...args);
	}
};

export { debug, global, migrate, express, access, auth, nginx, ssl, certbot, importer, setup, ipRanges, remoteVersion };
