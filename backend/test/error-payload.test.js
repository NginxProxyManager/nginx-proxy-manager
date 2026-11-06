import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Ajv from "ajv/dist/2020.js";
import errs from "../lib/error.js";
import errorPayload from "../lib/express/error-payload.js";
import { getCompiledSchema } from "../schema/index.js";

const summary = () => ({
	checked: 3,
	regenerated: 1,
	offline: [{ host_type: "proxy_host", id: 4, name: "broken.example.com", error: 'unknown directive "proxy_passs"' }],
	failed: [{ host_type: "stream", id: 2, name: "2222", error: "Certificate file is missing" }],
	warnings: [],
	skipped: [],
	duration_ms: 1200,
});

// The error response schemas of POST /api/nginx/regenerate, from the dereferenced swagger file
const regenerateErrorValidator = async (status) => {
	const schema = await getCompiledSchema();
	const ajv = new Ajv({ allErrors: true, allowUnionTypes: true, strict: false });
	return ajv.compile(schema.paths["/nginx/regenerate"].post.responses[status].content["application/json"].schema);
};

describe("errorPayload", () => {
	it("keeps the partial summary of a failed regeneration on an internal error", () => {
		// What regenerateAll() throws when the final nginx reload fails after hosts were taken offline
		const err = new errs.InternalError("Command failed: /usr/sbin/nginx -s reload");
		err.regenerateSummary = summary();

		const payload = errorPayload(err);
		assert.equal(payload.error.code, 500);
		// The internal message stays hidden, only the summary is added
		assert.equal(payload.error.message, "Internal Error");
		assert.equal(payload.error.details, undefined);
		assert.deepEqual(payload.error.regenerate_summary, summary());
		assert.equal(payload.debug, undefined);
	});

	it("keeps the summary next to the nginx details of a public nginx error", () => {
		const err = new errs.NginxConfigError("nginx: [emerg] bad global config", {
			kind: "nginx_config",
			scope: "global",
		});
		err.regenerateSummary = summary();

		const payload = errorPayload(err);
		assert.equal(payload.error.code, 400);
		assert.equal(payload.error.message, "nginx: [emerg] bad global config");
		// The summary is not mixed into details, the frontend reads details.kind for nginx errors
		assert.deepEqual(payload.error.details, { kind: "nginx_config", scope: "global" });
		assert.deepEqual(payload.error.regenerate_summary, summary());
	});

	it("leaves other errors unchanged", () => {
		assert.deepEqual(errorPayload(new errs.ConflictError("A regeneration is running already")), {
			error: { code: 409, message: "A regeneration is running already" },
		});
		assert.deepEqual(errorPayload(new errs.InternalError("db down")), {
			error: { code: 500, message: "Internal Error" },
		});
		assert.deepEqual(errorPayload(new errs.PermissionError()), {
			error: { code: 403, message: "Permission Denied" },
		});
	});

	it("ignores a summary that is not an object", () => {
		const err = new errs.InternalError("boom");
		err.regenerateSummary = "nope";
		assert.equal(errorPayload(err).error.regenerate_summary, undefined);
	});

	it("adds the stack trace only in debug mode", () => {
		const payload = errorPayload(new errs.InternalError("boom"), { debug: true });
		assert.ok(Array.isArray(payload.debug.stack));
	});

	it("matches the documented error responses of POST /api/nginx/regenerate", async () => {
		const internal = new errs.InternalError("Command failed: /usr/sbin/nginx -s reload");
		internal.regenerateSummary = summary();
		const validate500 = await regenerateErrorValidator("500");
		assert.ok(validate500(errorPayload(internal)), JSON.stringify(validate500.errors));

		const nginx = new errs.NginxConfigError("nginx: [emerg] bad", { kind: "nginx_config", scope: "global" });
		nginx.regenerateSummary = summary();
		const validate400 = await regenerateErrorValidator("400");
		assert.ok(validate400(errorPayload(nginx)), JSON.stringify(validate400.errors));

		// The schema still rejects unknown error fields, so the new one has to be documented
		const bogus = errorPayload(internal);
		bogus.error.surprise = true;
		assert.equal(validate500(bogus), false);
	});
});
