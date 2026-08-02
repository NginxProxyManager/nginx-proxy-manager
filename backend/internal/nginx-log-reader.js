import crypto from "node:crypto";
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import errs from "../lib/error.js";

const DEFAULT_LOG_ROOT = "/data/logs";
const MAX_READ_BYTES = 1024 * 1024;
const MAX_FOLLOW_BYTES = 64 * 1024;
const MAX_FOLLOW_LINES = 500;
const CURSOR_TTL_MS = 10 * 60 * 1000;
const TAIL_LINE_OPTIONS = new Set([50, 200, 500]);
const cursorSecret = process.env.NGINX_LOG_CURSOR_SECRET || crypto.randomBytes(32).toString("hex");

const hostLogPrefixes = Object.freeze({
	proxy_host: "proxy-host",
	redirection_host: "redirection-host",
	dead_host: "dead-host",
	stream: "stream",
});

const systemLogFiles = Object.freeze({
	fallback_http_access: "fallback_http_access.log",
	fallback_http_error: "fallback_http_error.log",
	fallback_stream_access: "fallback_stream_access.log",
	fallback_error: "fallback_error.log",
	default_host_access: "default-host_access.log",
	default_host_error: "default-host_error.log",
	letsencrypt_requests_access: "letsencrypt-requests_access.log",
	letsencrypt_requests_error: "letsencrypt-requests_error.log",
});

const invalidInput = (message) => new errs.ValidationError(message);

const getLogRoot = () => path.resolve(process.env.NGINX_LOGS_DIR || DEFAULT_LOG_ROOT);

const makeHostTarget = (scope, id, logKind) => {
	if (!Object.hasOwn(hostLogPrefixes, scope)) throw invalidInput("Unsupported Nginx log target");
	if (!Number.isInteger(id) || id < 1) throw invalidInput("Invalid Nginx log target id");
	if (logKind !== "access" && logKind !== "error") throw invalidInput("Unsupported Nginx log type");
	return Object.freeze({
		scope,
		id,
		logKind,
		fileName: `${hostLogPrefixes[scope]}-${id}_${logKind}.log`,
	});
};

const makeSystemTarget = (systemLogId) => {
	if (!Object.hasOwn(systemLogFiles, systemLogId)) throw invalidInput("Unsupported Nginx system log");
	return Object.freeze({
		scope: "system",
		id: systemLogId,
		logKind: systemLogId.endsWith("_error") ? "error" : "access",
		fileName: systemLogFiles[systemLogId],
	});
};

const normalizeTailLines = (value) => {
	if (typeof value === "undefined" || value === null || value === "") return 200;
	if (typeof value === "string" && !/^\d+$/.test(value)) throw invalidInput("tail_lines must be one of 50, 200, or 500");
	const tailLines = Number(value);
	if (!Number.isInteger(tailLines) || !TAIL_LINE_OPTIONS.has(tailLines)) throw invalidInput("tail_lines must be one of 50, 200, or 500");
	return tailLines;
};

const getTargetPath = (target, rootDir = getLogRoot()) => {
	const resolvedRoot = path.resolve(rootDir);
	const targetPath = path.resolve(resolvedRoot, target.fileName);
	const relativePath = path.relative(resolvedRoot, targetPath);
	if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) throw invalidInput("Invalid Nginx log target");
	return targetPath;
};

const getOpenFlags = () => fsConstants.O_RDONLY | (process.platform === "win32" ? 0 : (fsConstants.O_NOFOLLOW || 0));

const openLogFile = async (target, rootDir) => {
	const targetPath = getTargetPath(target, rootDir);
	let before;
	try {
		before = await fs.lstat(targetPath);
	} catch (error) {
		if (error.code === "ENOENT") return null;
		throw error;
	}
	if (!before.isFile() || before.isSymbolicLink()) throw invalidInput("Nginx log target is not a regular file");

	let handle;
	try {
		handle = await fs.open(targetPath, getOpenFlags());
		const stat = await handle.stat();
		if (!stat.isFile()) throw invalidInput("Nginx log target is not a regular file");
		return { handle, stat };
	} catch (error) {
		await handle?.close();
		if (error.code === "ENOENT") return null;
		throw error;
	}
};

const makeGeneration = (stat) =>
	crypto.createHmac("sha256", cursorSecret).update(`${stat.dev}:${stat.ino}:${stat.birthtimeMs}`).digest("base64url").slice(0, 32);

const makeCursor = ({ target, generation, offset, userId, now = Date.now() }) => {
	const payload = {
		v: 1,
		s: target.scope,
		i: target.id,
		k: target.logKind,
		g: generation,
		o: offset,
		u: userId || 0,
		e: now + CURSOR_TTL_MS,
	};
	const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
	const signature = crypto.createHmac("sha256", cursorSecret).update(encoded).digest("base64url");
	return `${encoded}.${signature}`;
};

const parseCursor = (cursor, target, userId, now = Date.now()) => {
	if (typeof cursor !== "string" || !cursor.includes(".")) throw invalidInput("Invalid Nginx log cursor");
	const [encoded, signature, ...extra] = cursor.split(".");
	if (!encoded || !signature || extra.length) throw invalidInput("Invalid Nginx log cursor");
	const expected = crypto.createHmac("sha256", cursorSecret).update(encoded).digest("base64url");
	if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)))
		throw invalidInput("Invalid Nginx log cursor");

	let payload;
	try {
		payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
	} catch {
		throw invalidInput("Invalid Nginx log cursor");
	}
	if (
		payload?.v !== 1 ||
		payload.s !== target.scope ||
		payload.i !== target.id ||
		payload.k !== target.logKind ||
		payload.u !== (userId || 0) ||
		!Number.isSafeInteger(payload.o) ||
		payload.o < 0 ||
		!Number.isSafeInteger(payload.e) ||
		payload.e < now ||
		typeof payload.g !== "string"
	)
		throw invalidInput("Invalid or expired Nginx log cursor");
	return payload;
};

const readRange = async (handle, start, end) => {
	const length = Math.max(0, end - start);
	if (!length) return Buffer.alloc(0);
	const buffer = Buffer.alloc(length);
	const { bytesRead } = await handle.read(buffer, 0, length, start);
	return buffer.subarray(0, bytesRead);
};

const splitLines = (text) => text.replace(/\r\n/g, "\n").split("\n");

const tailContent = (buffer, tailLines, wasByteLimited) => {
	let text = buffer.toString("utf8");
	if (wasByteLimited) {
		const firstNewline = text.indexOf("\n");
		text = firstNewline === -1 ? "" : text.slice(firstNewline + 1);
	}
	const lines = splitLines(text);
	if (lines.length && lines.at(-1) === "") lines.pop();
	const selected = lines.slice(-tailLines);
	return { content: selected.length ? `${selected.join("\n")}\n` : "", linesReturned: selected.length, truncated: wasByteLimited || lines.length > tailLines };
};

const incrementalContent = (buffer, hasMore) => {
	let newlineCount = 0;
	let consumedBytes = 0;
	for (let index = 0; index < buffer.length; index += 1) {
		if (buffer[index] !== 0x0a) continue;
		newlineCount += 1;
		consumedBytes = index + 1;
		if (newlineCount === MAX_FOLLOW_LINES) break;
	}
	const content = consumedBytes ? buffer.subarray(0, consumedBytes).toString("utf8") : "";
	return {
		content,
		linesReturned: newlineCount,
		consumedBytes,
		truncated: hasMore || consumedBytes < buffer.length,
	};
};

const absentResult = (target, userId, { mode = "tail", reset = false, resetReason = null } = {}) => ({
	target: { scope: target.scope, id: target.id, log_kind: target.logKind },
	content: "",
	mode,
	// A signed sentinel cursor lets a client follow a log file that does not
	// exist yet. Once Nginx creates it, its generation differs and causes a
	// normal reset/snapshot event.
	next_cursor: makeCursor({ target, generation: "absent", offset: 0, userId }),
	file: { exists: false, modified_at: null, size_bytes: 0, generation: null },
	lines_returned: 0,
	truncated: false,
	reset,
	...(resetReason ? { reset_reason: resetReason } : {}),
});

const snapshot = async ({ target, tailLines, userId, rootDir }) => {
	const opened = await openLogFile(target, rootDir);
	if (!opened) return absentResult(target, userId);
	const { handle, stat } = opened;
	try {
		const start = Math.max(0, stat.size - MAX_READ_BYTES);
		const buffer = await readRange(handle, start, stat.size);
		const data = tailContent(buffer, tailLines, start > 0);
		const generation = makeGeneration(stat);
		return {
			target: { scope: target.scope, id: target.id, log_kind: target.logKind },
			content: data.content,
			mode: "tail",
			next_cursor: makeCursor({ target, generation, offset: stat.size, userId }),
			file: { exists: true, modified_at: stat.mtime.toISOString(), size_bytes: stat.size, generation },
			lines_returned: data.linesReturned,
			truncated: data.truncated,
			reset: false,
		};
	} finally {
		await handle.close();
	}
};

const incremental = async ({ target, cursor, userId, rootDir }) => {
	const parsed = parseCursor(cursor, target, userId);
	const opened = await openLogFile(target, rootDir);
	if (!opened) {
		if (parsed.g === "absent") return absentResult(target, userId, { mode: "incremental" });
		return absentResult(target, userId, { mode: "incremental", reset: true, resetReason: "rotated" });
	}
	const { handle, stat } = opened;
	try {
		const generation = makeGeneration(stat);
		if (generation !== parsed.g || stat.size < parsed.o) {
			const result = await snapshot({ target, tailLines: 200, userId, rootDir });
			return { ...result, mode: "tail", reset: true, reset_reason: stat.size < parsed.o ? "truncated" : "rotated" };
		}
		const end = Math.min(stat.size, parsed.o + MAX_FOLLOW_BYTES);
		const buffer = await readRange(handle, parsed.o, end);
		const data = incrementalContent(buffer, end < stat.size);
		const nextOffset = parsed.o + data.consumedBytes;
		return {
			target: { scope: target.scope, id: target.id, log_kind: target.logKind },
			content: data.content,
			mode: "incremental",
			next_cursor: makeCursor({ target, generation, offset: nextOffset, userId }),
			file: { exists: true, modified_at: stat.mtime.toISOString(), size_bytes: stat.size, generation },
			lines_returned: data.linesReturned,
			truncated: data.truncated,
			reset: false,
		};
	} finally {
		await handle.close();
	}
};

export {
	CURSOR_TTL_MS,
	MAX_FOLLOW_BYTES,
	MAX_READ_BYTES,
	makeHostTarget,
	makeSystemTarget,
	normalizeTailLines,
	getLogRoot,
	getTargetPath,
	incremental,
	snapshot,
};
