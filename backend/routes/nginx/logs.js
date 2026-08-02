import express from "express";
import internalLogFollowHub from "../../internal/nginx-log-follow-hub.js";
import {
	incremental,
	makeHostTarget,
	makeSystemTarget,
	normalizeTailLines,
	snapshot,
} from "../../internal/nginx-log-reader.js";
import jwtdecode from "../../lib/express/jwt-decode.js";
import errs from "../../lib/error.js";
import { debug, express as logger } from "../../logger.js";

const HEARTBEAT_MS = 15 * 1000;
const MAX_SESSION_MS = 30 * 60 * 1000;
const MAX_PENDING_BYTES = 1024 * 1024;

const parseId = (value) => {
	if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) throw new errs.ValidationError("Invalid Nginx log target id");
	const id = Number(value);
	if (!Number.isSafeInteger(id)) throw new errs.ValidationError("Invalid Nginx log target id");
	return id;
};

const userId = (access) => access.token.getUserId(0);

const getTailLines = (req) => normalizeTailLines(req.query.tail_lines);

const writeSse = (res, event, data, id) => {
	if (res.destroyed || res.writableEnded) return false;
	try {
		let frame = "";
		if (id) frame += `id: ${id}\n`;
		if (event) frame += `event: ${event}\n`;
		frame += `data: ${JSON.stringify(data)}\n\n`;
		const writable = res.write(frame);
		if (res.writableLength > MAX_PENDING_BYTES) {
			res.end();
			return false;
		}
		return writable || !res.destroyed;
	} catch {
		return false;
	}
};

const writeHeartbeat = (res) => {
	if (res.destroyed || res.writableEnded) return false;
	try {
		return res.write(`: heartbeat ${Date.now()}\n\n`) || !res.destroyed;
	} catch {
		return false;
	}
};

const streamHeaders = (res) => {
	res.status(200).set({
		"Content-Type": "text/event-stream; charset=utf-8",
		"Cache-Control": "no-cache, no-transform",
		Connection: "keep-alive",
		"X-Accel-Buffering": "no",
		"X-Content-Type-Options": "nosniff",
	});
	res.flushHeaders?.();
};

const startFollow = async ({ req, res, target, access }) => {
	if (typeof req.query.cursor !== "string" || !req.query.cursor) throw new errs.ValidationError("A Nginx log cursor is required");
	const actorId = userId(access);
	const initial = await incremental({ target, cursor: req.query.cursor, userId: actorId });
	let controller = null;
	let closed = false;
	let heartbeat = null;
	let maxSession = null;
	const close = () => {
		if (closed) return;
		closed = true;
		if (heartbeat) clearInterval(heartbeat);
		if (maxSession) clearTimeout(maxSession);
		controller?.unsubscribe();
	};
	const onEvent = (event, data, eventId) => {
		const accepted = writeSse(res, event, data, eventId);
		if (event === "error" || event === "close" || !accepted) {
			close();
			if (!res.writableEnded) res.end();
		}
		return accepted;
	};

	// Reserve the per-user stream slot before sending SSE headers. This lets the
	// standard error middleware return a real 429 if the user exceeded the cap.
	controller = internalLogFollowHub.subscribe({
		target,
		userId: actorId,
		cursor: initial.next_cursor,
		onEvent,
		canSend: () => !closed && !res.destroyed && !res.writableEnded && !res.writableNeedDrain,
	});
	streamHeaders(res);
	if (initial.reset && !onEvent("reset", initial, initial.next_cursor)) return;
	if (!initial.reset && initial.content && !onEvent("append", initial, initial.next_cursor)) return;
	if (!onEvent("ready", { cursor: initial.next_cursor, generation: initial.file.generation, server_time: new Date().toISOString() }, initial.next_cursor)) return;

	res.on("drain", () => controller?.poll());
	req.on("close", close);
	res.on("close", close);
	heartbeat = setInterval(() => {
		if (!writeHeartbeat(res)) close();
	}, HEARTBEAT_MS);
	heartbeat.unref?.();
	maxSession = setTimeout(() => {
		onEvent("close", { reason: "max_session" });
	}, MAX_SESSION_MS);
	maxSession.unref?.();
	controller.poll();
};

const createHostHandlers = ({ scope, idParam, internalHost }) => ({
	snapshot: async (req, res, next) => {
		try {
			const id = parseId(req.params[idParam]);
			await internalHost.get(res.locals.access, { id });
			const result = await snapshot({
				target: makeHostTarget(scope, id, req.params.log_kind),
				tailLines: getTailLines(req),
				userId: userId(res.locals.access),
			});
			res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }).status(200).send(result);
		} catch (error) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${error}`);
			next(error);
		}
	},
	follow: async (req, res, next) => {
		try {
			const id = parseId(req.params[idParam]);
			await internalHost.get(res.locals.access, { id });
			await startFollow({ target: makeHostTarget(scope, id, req.params.log_kind), req, res, access: res.locals.access });
		} catch (error) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${error}`);
			if (!res.headersSent) next(error);
			else res.end();
		}
	},
});

const registerHostLogRoutes = (router, { scope, idParam, internalHost }) => {
	const handlers = createHostHandlers({ scope, idParam, internalHost });
	router.options(`/:${idParam}/logs/:log_kind`, (_, res) => res.sendStatus(204));
	router.options(`/:${idParam}/logs/:log_kind/follow`, (_, res) => res.sendStatus(204));
	router.get(`/:${idParam}/logs/:log_kind`, jwtdecode(), handlers.snapshot);
	router.get(`/:${idParam}/logs/:log_kind/follow`, jwtdecode(), handlers.follow);
};

const router = express.Router({ caseSensitive: true, strict: true, mergeParams: true });

const assertSystemLogAccess = async (access) => {
	// Existing users:list permission is admin-only and avoids adding a new
	// permission section just for fixed, globally shared Nginx system logs.
	await access.can("users:list");
};

router.options("/:system_log_id", (_, res) => res.sendStatus(204));
router.options("/:system_log_id/follow", (_, res) => res.sendStatus(204));
router.get("/:system_log_id", jwtdecode(), async (req, res, next) => {
	try {
		await assertSystemLogAccess(res.locals.access);
		const result = await snapshot({
			target: makeSystemTarget(req.params.system_log_id),
			tailLines: getTailLines(req),
			userId: userId(res.locals.access),
		});
		res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }).status(200).send(result);
	} catch (error) {
		debug(logger, `${req.method.toUpperCase()} ${req.path}: ${error}`);
		next(error);
	}
});
router.get("/:system_log_id/follow", jwtdecode(), async (req, res, next) => {
	try {
		await assertSystemLogAccess(res.locals.access);
		await startFollow({ target: makeSystemTarget(req.params.system_log_id), req, res, access: res.locals.access });
	} catch (error) {
		debug(logger, `${req.method.toUpperCase()} ${req.path}: ${error}`);
		if (!res.headersSent) next(error);
		else res.end();
	}
});

export { registerHostLogRoutes };
export default router;
