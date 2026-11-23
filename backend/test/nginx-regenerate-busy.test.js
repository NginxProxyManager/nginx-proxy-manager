// A second POST /api/nginx/regenerate while one runs gets a 409. The first run is held on a promise the test
// releases, so the two requests overlap for sure (the Cypress spec can't hold a run, its requests may not overlap).
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import errorPayload from "../lib/express/error-payload.js";
import { access, db, load } from "./support/backend.js";

const errs = await load("lib/error.js");
const internalNginx = await load("internal/nginx.js");
const internalAuditLog = await load("internal/audit-log.js");
const internalNginxRegenerate = await load("internal/nginx-regenerate.js");

const real = { regenerateAll: internalNginx.regenerateAll, add: internalAuditLog.add };
const audits = [];
internalAuditLog.add = async (_access, data) => {
	audits.push(data);
};

after(async () => {
	internalNginx.regenerateAll = real.regenerateAll;
	internalAuditLog.add = real.add;
	await db.destroy();
});

const summary = () => ({
	checked: 2,
	regenerated: 2,
	offline: [],
	failed: [],
	warnings: [],
	skipped: [],
	duration_ms: 10,
});

describe("regenerating while a regeneration runs", () => {
	it("refuses the second request with a 409 and lets the next one run", async () => {
		let release;
		let calls = 0;
		internalNginx.regenerateAll = () => {
			calls++;
			return new Promise((resolve) => (release = resolve));
		};

		const first = internalNginxRegenerate.regenerate(access, {});
		// the first run is past access.can() and holds the flight
		while (!release) {
			await new Promise((resolve) => setImmediate(resolve));
		}

		await assert.rejects(internalNginxRegenerate.regenerate(access, {}), (err) => {
			assert.ok(err instanceof errs.ConflictError);
			assert.equal(err.message_i18n, "settings.nginx.regenerate.busy");
			// what the API answers
			assert.equal(errorPayload(err).error.code, 409);
			return true;
		});
		// the refused request didn't start a run and wrote no audit entry
		assert.equal(calls, 1);
		assert.equal(audits.length, 0);

		release(summary());
		assert.deepEqual(await first, summary());
		assert.equal(audits.length, 1);
		assert.equal(audits[0].object_type, "nginx-config");

		// free again once the first run finished
		internalNginx.regenerateAll = async () => summary();
		assert.deepEqual(await internalNginxRegenerate.regenerate(access, {}), summary());
		assert.equal(audits.length, 2);
	});
});
