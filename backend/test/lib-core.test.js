import assert from "node:assert/strict";
import test from "node:test";
import cors from "../lib/express/cors.js";
import jwt from "../lib/express/jwt.js";
import pagination from "../lib/express/pagination.js";
import userIdFromMe from "../lib/express/user-id-from-me.js";
import errs from "../lib/error.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool, parseDatePeriod } from "../lib/helpers.js";
import validator from "../lib/validator/index.js";
import { debug } from "../logger.js";

test("all public error types retain status, details, and Error inheritance", () => {
	const previous = new Error("previous");
	const cases = [
		[new errs.PermissionError(null, previous), 403],
		[new errs.ItemNotFoundError(7, previous), 404, "Not Found - 7"],
		[new errs.ItemNotFoundError(), 404, "Not Found"],
		[new errs.AuthError("bad auth", "auth.bad", previous), 400],
		[new errs.InternalError("internal", previous), 500],
		[new errs.InternalValidationError("invalid", previous), 400],
		[new errs.ConfigurationError("config", previous), 400],
		[new errs.CacheError("cache", previous), 500],
		[new errs.ValidationError("validation", previous), 400],
		[new errs.AssertionFailedError("assertion", previous), 400],
		[new errs.ConflictError("conflict", "REVISION", { id: 1 }, previous), 409],
		[new errs.UnprocessableConfigError("nginx", { line: 2 }, previous), 422],
		[new errs.ServiceUnavailableError("down", "NGINX_DOWN", { retry: true }, previous), 503],
	];
	for (const [error, status, message] of cases) {
		assert.ok(error instanceof Error);
		assert.equal(error.status, status);
		if (message) assert.equal(error.message, message);
	}
	const command = new errs.CommandError("stderr", 9, previous);
	assert.equal(command.code, 9);
	assert.equal(command.message, "stderr");
});

test("date and boolean helpers handle valid, invalid, present, and missing fields", () => {
	assert.equal(parseDatePeriod("invalid"), null);
	const future = parseDatePeriod("2d");
	assert.ok(future.isAfter());
	assert.deepEqual(convertIntFieldsToBool({ enabled: 1, disabled: 0 }, ["enabled", "disabled", "missing"]), {
		enabled: true,
		disabled: false,
	});
	assert.deepEqual(convertBoolFieldsToInt({ enabled: true, disabled: false }, ["enabled", "disabled", "missing"]), {
		enabled: 1,
		disabled: 0,
	});
});

test("request middleware handles CORS, bearer tokens, user ids, and pagination", () => {
	let calls = 0;
	const next = () => calls++;
	const setValues = [];
	cors({ headers: { origin: "https://admin.example" } }, { set: (value) => setValues.push(value) }, next);
	cors({ headers: {} }, { set: () => assert.fail("must not set") }, next);
	assert.equal(setValues[0]["Access-Control-Allow-Origin"], "https://admin.example");

	const tokenResponse = { locals: {} };
	jwt()({ headers: { authorization: "Bearer token-value" } }, tokenResponse, next);
	assert.equal(tokenResponse.locals.token, "token-value");
	jwt()({ headers: { authorization: "Basic ignored" } }, { locals: {} }, next);
	jwt()({ headers: {} }, { locals: {} }, next);

	const meRequest = { params: { user_id: "me" } };
	userIdFromMe(meRequest, { locals: { access: { token: { get: () => ({ id: 12 }) } } } }, next);
	assert.equal(meRequest.params.user_id, 12);
	const numericRequest = { params: { user_id: "42" } };
	userIdFromMe(numericRequest, { locals: {} }, next);
	assert.equal(numericRequest.params.user_id, 42);

	const defaultRequest = { query: {} };
	pagination("name.asc", 2, 25, 100)(defaultRequest, {}, next);
	assert.deepEqual(defaultRequest.query, { offset: 2, limit: 25, sort: [{ field: "name", dir: "asc" }] });
	const boundedRequest = { query: { offset: "10", limit: "500", sort: "name.desc,id" } };
	pagination("ignored", 0, 50, 100)(boundedRequest, {}, next);
	assert.deepEqual(boundedRequest.query, {
		offset: 10,
		limit: 100,
		sort: [
			{ field: "name", dir: "desc" },
			{ field: "id", dir: "asc" },
		],
	});
	assert.equal(calls, 9);
});

test("JSON schema validator clones valid payloads and rejects invalid inputs", async () => {
	const schema = {
		type: "object",
		required: ["name"],
		additionalProperties: false,
		properties: { name: { type: "string" }, count: { type: "integer" } },
	};
	const payload = { name: "proxy", count: "2" };
	const result = await validator(schema, payload);
	assert.deepEqual(result, { name: "proxy", count: 2 });
	assert.notEqual(result, payload);
	await assert.rejects(() => validator(schema, null), errs.InternalValidationError);
	await assert.rejects(() => validator(schema, { count: 2 }), errs.InternalValidationError);
	await assert.rejects(() => validator({ type: "not-a-real-type" }, { name: "x" }));
});

test("debug logging follows the DEBUG environment flag", () => {
	const previous = process.env.DEBUG;
	const calls = [];
	const logger = { debug: (...args) => calls.push(args) };
	delete process.env.DEBUG;
	debug(logger, "quiet");
	process.env.DEBUG = "1";
	debug(logger, "visible", 7);
	assert.deepEqual(calls, [["visible", 7]]);
	if (typeof previous === "undefined") delete process.env.DEBUG;
	else process.env.DEBUG = previous;
});
