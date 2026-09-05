import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const testRoot = await mkdtemp(path.join(os.tmpdir(), "npm-log-route-test-"));
process.env.NPM_KEYS_FILE = path.join(testRoot, "keys.json");
process.env.DB_SQLITE_FILE = path.join(testRoot, "database.sqlite");
process.env.NGINX_LOGS_DIR = testRoot;

const {
	createHostHandlers,
	getTailLines,
	parseId,
	startFollow,
	streamHeaders,
	userId,
	writeHeartbeat,
	writeSse,
} = await import("../routes/nginx/logs.js");
const { makeSystemTarget, snapshot } = await import("../internal/nginx-log-reader.js");

test("log route helpers validate ids, normalize tails and serialize SSE frames", () => {
	assert.equal(parseId("42"), 42);
	for (const value of [undefined, "0", "-1", "1.2", "abc", "999999999999999999999"]) {
		assert.throws(() => parseId(value), /Invalid Nginx log target id/);
	}
	assert.equal(getTailLines({ query: { tail_lines: "50" } }), 50);
	assert.equal(userId({ token: { getUserId: (fallback) => fallback + 9 } }), 9);

	const frames = [];
	const response = {
		destroyed: false,
		writableEnded: false,
		writableLength: 0,
		write: (frame) => { frames.push(frame); return true; },
		end: () => { response.writableEnded = true; },
	};
	assert.equal(writeSse(response, "append", { value: 1 }, "cursor-1"), true);
	assert.match(frames[0], /id: cursor-1\nevent: append\ndata: \{"value":1\}/);
	assert.equal(writeHeartbeat(response), true);
	response.destroyed = true;
	assert.equal(writeSse(response, "append", {}), false);
	assert.equal(writeHeartbeat(response), false);
	response.destroyed = false;
	response.writableLength = 2 * 1024 * 1024;
	assert.equal(writeSse(response, "append", {}), false);
	assert.equal(response.writableEnded, true);
});

test("log stream headers and host handlers cover snapshots and validation failures", async () => {
	const headers = {};
	const response = new EventEmitter();
	Object.assign(response, {
		locals: { access: { token: { getUserId: () => 9 } } },
		status(code) { response.statusCode = code; return response; },
		set(values) { Object.assign(headers, values); return response; },
		send(value) { response.body = value; return response; },
		flushHeaders() { response.flushed = true; },
	});
	streamHeaders(response);
	assert.equal(response.statusCode, 200);
	assert.equal(headers["Content-Type"], "text/event-stream; charset=utf-8");
	assert.equal(response.flushed, true);

	const seen = [];
	const internalHost = { get: async (_access, data) => seen.push(data.id) };
	const handlers = createHostHandlers({ scope: "proxy_host", idParam: "proxy_host_id", internalHost });
	const request = new EventEmitter();
	Object.assign(request, { method: "get", path: "/7/logs/access", params: { proxy_host_id: "7", log_kind: "access" }, query: { tail_lines: "50" } });
	let caught = null;
	await handlers.snapshot(request, response, (error) => { caught = error; });
	assert.equal(caught, null);
	assert.deepEqual(seen, [7]);
	assert.equal(response.body.target.scope, "proxy_host");

	request.params.proxy_host_id = "bad";
	await handlers.snapshot(request, response, (error) => { caught = error; });
	assert.match(caught.message, /Invalid Nginx log target id/);
	request.params.proxy_host_id = "7";
	request.query = {};
	response.headersSent = false;
	await handlers.follow(request, response, (error) => { caught = error; });
	assert.match(caught.message, /cursor is required/);
});

test("log follow starts an SSE session, publishes readiness and releases it on close", async () => {
	const target = makeSystemTarget("fallback_error");
	const initial = await snapshot({ target, tailLines: 50, userId: 9 });
	const request = new EventEmitter();
	request.query = { cursor: initial.next_cursor };
	const frames = [];
	const response = new EventEmitter();
	Object.assign(response, {
		destroyed: false,
		writableEnded: false,
		writableNeedDrain: false,
		writableLength: 0,
		headersSent: false,
		status() { return response; },
		set() { return response; },
		flushHeaders() { response.headersSent = true; },
		write(frame) { frames.push(frame); return true; },
		end() { response.writableEnded = true; },
	});
	await startFollow({
		req: request,
		res: response,
		target,
		access: { token: { getUserId: () => 9 } },
	});
	assert.equal(response.headersSent, true);
	assert.ok(frames.some((frame) => frame.includes("event: ready")));
	request.emit("close");
	await new Promise((resolve) => setImmediate(resolve));
});
