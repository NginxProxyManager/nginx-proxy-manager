import assert from "node:assert/strict";
import { test } from "node:test";
import { errorDiagnostics } from "../lib/error-diagnostics.js";
import { requestLogArgs, resumeRequestContext, sensitiveRequestContext } from "../lib/request-context.js";

const run = (path, authorization, next) => {
	const res = {
		locals: {},
		headers: {},
		set(name, value) {
			this.headers[name] = value;
		},
	};
	const promise = new Promise((resolve, reject) =>
		sensitiveRequestContext({ path, method: "POST", headers: { authorization } }, res, () =>
			Promise.resolve().then(next).then(resolve, reject),
		),
	);
	return { res, promise };
};

test("sensitive request logs isolate concurrent async work and leave JWT diagnostics intact", async () => {
	const args = ["SECRET_BODY", Object.assign(new TypeError("SECRET_MESSAGE"), { code: "EACCES", status: 500 })];
	const release = Promise.withResolvers();
	const pat = run("/nginx/proxy-hosts/SECRET_PATH", "Bearer npm_pat_SECRET", async () => {
		await release.promise;
		return requestLogArgs(args);
	});
	const management = run("/api-tokens/options", "Bearer jwt", async () => requestLogArgs(args));
	const ordinary = run("/nginx/proxy-hosts", "Bearer jwt", async () => requestLogArgs(args));
	release.resolve();
	const [a, b, c] = await Promise.all([pat.promise, management.promise, ordinary.promise]);
	assert.equal(c, args);
	assert.equal(requestLogArgs(args), args);
	assert.equal(a[1].request_id, pat.res.headers["X-Request-ID"]);
	assert.notEqual(a[1].request_id, b[1].request_id);
	assert.equal(a[1].route, "proxy-hosts");
	assert.equal(b[1].route, "api-tokens");
	assert.equal(a[1].error, "TypeError");
	assert.equal(a[1].code, "EACCES");
	assert.equal(a[1].status, 500);
	assert.ok(!JSON.stringify([a, b]).includes("SECRET"));
	// Simulate a multipart parser continuing from an event outside the context.
	resumeRequestContext({}, pat.res, () => {
		assert.deepEqual(requestLogArgs(args), a);
	});
});

test("request sink retains already-sanitized command failure diagnostics", async () => {
	const safe = errorDiagnostics({ name: "CommandError", code: 17, message: "SECRET_COMMAND" });
	const { promise } = run("/nginx/access-lists/1", "Bearer npm_pat_SECRET", () =>
		requestLogArgs(["build failed", safe]),
	);
	const result = await promise;
	assert.equal(result[1].error, "CommandError");
	assert.equal(result[1].exit_code, 17);
	assert.ok(!JSON.stringify(result).includes("SECRET"));
});

test("token management detection matches the mounted path, not arbitrary substrings", async () => {
	for (const path of ["/api-tokens", "/api-tokens/", "/api-tokens/1", "/api-tokens/options"]) {
		const { res, promise } = run(path, "", () => {});
		await promise;
		assert.equal(res.locals.sensitiveRequest, true, path);
	}
	for (const path of ["/api-tokens-other", "/other/api-tokens", "/nginx/proxy-hosts/api-tokens"]) {
		const { res, promise } = run(path, "", () => {});
		await promise;
		assert.equal(res.locals.sensitiveRequest, undefined, path);
	}
});
