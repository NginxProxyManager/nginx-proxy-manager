import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const testRoot = await mkdtemp(path.join(os.tmpdir(), "npm-app-test-"));
process.env.NPM_KEYS_FILE = path.join(testRoot, "keys.json");
process.env.DB_SQLITE_FILE = path.join(testRoot, "database.sqlite");
process.env.X_FRAME_OPTIONS = "SAMEORIGIN";
process.env.DEBUG = "true";

const { default: app, errorHandler } = await import("../app.js");

test("application error handler preserves public structured error fields", () => {
	const sent = [];
	const response = {
		status(code) { sent.push(code); return response; },
		send(payload) { sent.push(payload); return response; },
	};
	const publicError = Object.assign(new Error("Teapot"), {
		status: 418,
		public: true,
		error_code: "TEAPOT",
		details: { cup: "empty" },
		message_i18n: "error.teapot",
		previous: "root cause",
	});
	errorHandler(publicError, { baseUrl: "/nginx/certificates", path: "/4" }, response);
	assert.equal(sent[0], 418);
	assert.equal(sent[1].error.message, "Teapot");
	assert.equal(sent[1].error.error_code, "TEAPOT");
	assert.deepEqual(sent[1].error.details, { cup: "empty" });
	assert.equal(sent[1].error.message_i18n, "error.teapot");
	assert.equal(sent[1].debug.previous, "root cause");

	sent.length = 0;
	errorHandler(new Error("secret"), { baseUrl: "", path: "/private" }, response);
	assert.equal(sent[0], 500);
	assert.equal(sent[1].error.message, "Internal Error");
});

test("application stack exposes security headers and formats authentication errors", async (context) => {
	const server = app.listen(0, "127.0.0.1");
	await new Promise((resolve) => server.once("listening", resolve));
	context.after(() => new Promise((resolve) => server.close(resolve)));
	const baseUrl = `http://127.0.0.1:${server.address().port}`;

	const missing = await fetch(`${baseUrl}/definitely-missing`);
	assert.equal(missing.status, 404);
	assert.equal(missing.headers.get("x-frame-options"), "SAMEORIGIN");
	assert.equal(missing.headers.get("x-content-type-options"), "nosniff");
	assert.match(missing.headers.get("cache-control"), /no-store/);
	assert.equal(missing.headers.get("x-powered-by"), null);

	const protectedResponse = await fetch(`${baseUrl}/nginx/certificates`);
	assert.equal(protectedResponse.status, 403);
	const payload = await protectedResponse.json();
	assert.equal(payload.error.code, 403);
	assert.ok(payload.error.message);

	for (const suffix of ["", "/follow"]) {
		const logResponse = await fetch(`${baseUrl}/nginx/logs/fallback_error${suffix}`);
		assert.equal(logResponse.status, 403);
	}
	assert.equal((await fetch(`${baseUrl}/nginx/logs/fallback_error`, { method: "OPTIONS" })).status, 204);
});
