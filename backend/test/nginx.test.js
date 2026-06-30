import { describe, it } from "node:test";
import assert from "node:assert/strict";
import internalNginx from "../internal/nginx.js";

const hasDefault = internalNginx.advancedConfigHasDefaultLocation;

describe("advancedConfigHasDefaultLocation", () => {
	it("detects the exact config from issue #3678", () => {
		const cfg = `location / {
   proxy_set_header Host $http_host;
   proxy_set_header X-Forwarded-Host $http_host;
   proxy_set_header X-Forwarded-Port $server_port;
   proxy_set_header X-Forwarded-Proto $scheme;
   proxy_set_header X-Forwarded-For $remote_addr;
}`;
		assert.equal(hasDefault(cfg), true);
	});

	it("detects location / after other directives on separate lines", () => {
		const cfg = `proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
location / {
    proxy_pass http://backend;
}`;
		assert.equal(hasDefault(cfg), true);
	});

	it("detects location / with nginx modifiers (=, ^~, ~, ~*)", () => {
		assert.equal(hasDefault("location = / {"), true);
		assert.equal(hasDefault("location ^~ / {"), true);
		assert.equal(hasDefault("location ~ / {"), true);
		assert.equal(hasDefault("location ~* / {"), true);
	});

	it("detects location / after a semicolon on the same line", () => {
		assert.equal(hasDefault("set $test 1; location / {"), true);
	});

	it("ignores commented-out location / blocks", () => {
		assert.equal(hasDefault("# location / {"), false);
		const cfg = `proxy_set_header Host $host;
# location / {
#     proxy_pass http://old;
# }`;
		assert.equal(hasDefault(cfg), false);
	});

	it("detects real location / even when a commented one precedes it", () => {
		const cfg = `# location / { old stuff }
location / {
    proxy_pass http://new;
}`;
		assert.equal(hasDefault(cfg), true);
	});

	it("does not match non-root location paths", () => {
		assert.equal(hasDefault("location /api {"), false);
		assert.equal(hasDefault("location = /api {"), false);
		assert.equal(hasDefault("location ^~ /static {"), false);
		assert.equal(hasDefault("location ~ \\.php$ {"), false);
	});

	it("returns false when no location block is present", () => {
		assert.equal(hasDefault(""), false);
		assert.equal(hasDefault("proxy_set_header Host $host;"), false);
	});
});
