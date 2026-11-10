import assert from "node:assert/strict";
import { test } from "node:test";
import { errorDiagnostics } from "../lib/error-diagnostics.js";

test("diagnostics retain actionable error labels without arbitrary error content", () => {
	const err = Object.assign(new TypeError("PRIVATE_KEY_CANARY"), {
		code: "EACCES",
		status: 500,
		body: "PASSWORD_CANARY",
		previous: new Error("SECRET_CANARY"),
	});
	assert.deepEqual(errorDiagnostics(err), { error: "TypeError", code: "EACCES", status: 500 });
	assert.deepEqual(errorDiagnostics({ name: "SECRET_CANARY", code: "TOKEN_CANARY", status: "500" }), {
		error: "Error",
	});
	assert.deepEqual(errorDiagnostics({ type: "entity.parse.failed", code: 1 }), {
		error: "Error",
		type: "entity.parse.failed",
		exit_code: 1,
	});
	assert.deepEqual(errorDiagnostics({ code: 123456, status: 1000 }), { error: "Error" });
});

test("safe diagnostic mapping is idempotent, including bounded command exit codes", () => {
	for (const error of [
		{ name: "CommandError", code: 17, message: "SECRET" },
		{ name: "TypeError", code: "EACCES", status: 500 },
		{ name: "SyntaxError", type: "entity.parse.failed", status: 400 },
	]) {
		const safe = errorDiagnostics(error);
		assert.deepEqual(errorDiagnostics(safe), safe);
	}
	for (const exit_code of [-1, 256, 1.5, "17", "SECRET", null, false, Number.POSITIVE_INFINITY, Number.NaN]) {
		assert.deepEqual(errorDiagnostics({ exit_code }), { error: "Error" });
	}
});
