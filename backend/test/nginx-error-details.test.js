// The UI words an nginx error in its own language from NginxConfigError.details: where the error is (scope, area,
// relative_line, file, line, host_type/host_id), what kind it is (reason) and the humanised nginx error as an
// untranslated `detail`, plus `hint_code` for the hint. The English message stays for API users and logs.
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { db, load } from "./support/backend.js";

const internalNginx = await load("internal/nginx.js");

after(async () => {
	await db.destroy();
});

const ADVANCED = [
	"server {",
	"  listen 80;",
	"# npm-advanced-config-begin",
	"  add_header X-A 1;",
	"  proxy_passs http://x;",
	"# npm-advanced-config-end",
	"}",
].join("\n");

const host = { id: 7, advanced_config: "  add_header X-A 1;\n  proxy_passs http://x;" };
const file = "/data/nginx/proxy_host/7.conf";

describe("nginx error details for the UI", () => {
	it("an error in the host's advanced configuration: area, relative line, detail and hint code", () => {
		const err = internalNginx.buildConfigError(
			"host",
			"proxy_host",
			host,
			{ message: 'unknown directive "proxy_passs"', file, line: 5, output: "nginx: [emerg] ..." },
			ADVANCED,
		);
		assert.equal(err.message, 'Advanced configuration: unknown directive "proxy_passs" (line 2).');
		assert.equal(err.details.area, "host_advanced");
		assert.equal(err.details.relative_line, 2);
		assert.equal(err.details.detail, 'Unknown directive "proxy_passs".');
		assert.equal(err.details.hint_code, "unknown_directive");
		assert.equal(err.details.reason, undefined);
	});

	it("an error in a custom location or its advanced configuration: the location's index and path", () => {
		const text = [
			"server {",
			"# npm-location-begin 1",
			"  location /api {",
			"    proxy_pass http://app;",
			"# npm-location-advanced-begin 1",
			"    proxy_passs http://x;",
			"# npm-location-advanced-end 1",
			"  }",
			"# npm-location-end 1",
			"}",
		].join("\n");
		const withLocations = { id: 7, locations: [{ path: "/" }, { path: " /api " }] };
		const advanced = internalNginx.buildConfigError(
			"host",
			"proxy_host",
			withLocations,
			{ message: 'unknown directive "proxy_passs"', file, line: 6, output: "" },
			text,
		);
		assert.match(advanced.message, /^Custom location "\/api" advanced configuration: /);
		assert.equal(advanced.details.area, "location_advanced");
		assert.equal(advanced.details.relative_line, 1);
		assert.equal(advanced.details.location_index, 1);
		assert.equal(advanced.details.location_path, "/api");
		assert.equal(advanced.details.detail, 'Unknown directive "proxy_passs".');
		const location = internalNginx.buildConfigError(
			"host",
			"proxy_host",
			withLocations,
			{ message: 'host not found in upstream "app"', file, line: 4, output: "" },
			text,
		);
		assert.equal(location.details.area, "location");
		assert.equal(location.details.relative_line, null);
		assert.equal(location.details.location_path, "/api");
	});

	it("an error without a line that names something the advanced configuration uses", () => {
		const err = internalNginx.buildConfigError(
			"host",
			"proxy_host",
			{ id: 7, advanced_config: "add_header X $nope;" },
			{ message: 'unknown "nope" variable', file: null, line: null, output: "" },
			"",
		);
		assert.match(err.message, /^Advanced configuration: unknown variable/);
		assert.equal(err.details.area, "host_advanced");
		assert.equal(err.details.relative_line, null);
		assert.equal(err.details.detail, 'Unknown variable "$nope".');
		assert.equal(err.details.hint_code, "unknown_variable");
	});

	it("an error elsewhere in the host's config has no area", () => {
		const err = internalNginx.buildConfigError(
			"host",
			"proxy_host",
			host,
			{ message: 'host not found in upstream "app:80"', file, line: 2, output: "" },
			ADVANCED,
		);
		assert.equal(err.details.area, null);
		assert.equal(err.details.detail, 'Host "app" could not be resolved.');
		assert.equal(err.details.hint_code, "host_not_found");
	});

	it("a rule without a hint has no hint code, no nginx message no detail", () => {
		const noHint = internalNginx.buildConfigError(
			"host",
			"proxy_host",
			host,
			{ message: 'invalid parameter "x"', file, line: 2, output: "" },
			ADVANCED,
		);
		assert.equal(noHint.details.hint_code, null);
		const empty = internalNginx.buildConfigError("host", "proxy_host", host, { message: "", file, line: null }, "");
		assert.equal(empty.message, "Nginx kept rejecting the configuration.");
		assert.equal(empty.details.detail, null);
	});

	it("a global error keeps the file and line, or names the managed host", () => {
		const other = internalNginx.buildConfigError(
			"global",
			"proxy_host",
			host,
			{ message: 'unknown directive "x"', file: "/data/nginx/dead_host/3.conf", line: 4, output: "" },
			"",
		);
		assert.equal(other.details.host_type, "dead_host");
		assert.equal(other.details.host_id, 3);
		assert.equal(other.details.area, null);
		const custom = internalNginx.buildConfigError(
			"global",
			"proxy_host",
			host,
			{ message: 'unknown directive "x"', file: "/data/nginx/custom/http.conf", line: 4, output: "" },
			"",
		);
		assert.equal(custom.details.file, "/data/nginx/custom/http.conf");
		assert.equal(custom.details.line, 4);
		assert.equal(custom.details.detail, 'Unknown directive "x".');
	});

	it("a conflict with another host says which kind, with the default hint's code", () => {
		const parsed = { message: "duplicate listen options for 0.0.0.0:80", file: null, line: null, output: "" };
		const change = internalNginx.buildConflictError("proxy_host", host, parsed);
		assert.equal(change.details.reason, "conflict");
		assert.equal(change.details.hint_code, "conflict");
		assert.equal(change.details.detail, "Duplicate listen options for 0.0.0.0:80.");
		const regenerated = internalNginx.buildConflictError(
			"proxy_host",
			host,
			{ message: 'unknown directive "x"' },
			"The regenerated configuration",
		);
		assert.equal(regenerated.details.reason, "regenerated_conflict");
		assert.equal(regenerated.details.hint_code, "unknown_directive");
	});

	it("an automatically disabled host is flagged, its error details are not changed", () => {
		const err = internalNginx.buildConfigError(
			"other_host",
			"proxy_host",
			host,
			{ message: 'unknown directive "x"', file, line: 2 },
			ADVANCED,
		);
		const meta = internalNginx.buildOfflineMeta({}, err, null, "Disabled automatically: ");
		assert.match(meta.nginx_err, /^Disabled automatically: /);
		assert.equal(meta.nginx_details.auto_disabled, true);
		assert.equal(err.details.auto_disabled, undefined);
		assert.equal(internalNginx.buildOfflineMeta({}, err).nginx_details.auto_disabled, undefined);
	});
});
