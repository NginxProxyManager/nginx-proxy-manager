import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { prepareLocationForward } from "./upstream_host.js";

const locationTemplate = fs.readFileSync(new URL("../templates/_location.conf", import.meta.url), "utf8");
const nginxSource = fs.readFileSync(new URL("./nginx.js", import.meta.url), "utf8");

function renderLocationProxyPass(forwardHost, forwardPort, forwardPath = "") {
	const forward = prepareLocationForward(forwardHost);
	const path = forward.forward_path !== undefined ? forward.forward_path : forwardPath;
	return `proxy_pass http://${forward.forward_host}:${forwardPort}${path};`;
}

test("custom location template appends the port directly to forward_host", () => {
	assert.match(
		locationTemplate,
		/proxy_pass\s+\{\{\s*forward_scheme\s*\}\}:\/\/\{\{\s*forward_host\s*\}\}:\{\{\s*forward_port\s*\}\}/,
	);
	assert.match(nginxSource, /prepareLocationForward\(locationCopy\.forward_host\)/);
});

test("ipv6 custom location upstreams are bracketed before the port", () => {
	assert.equal(
		renderLocationProxyPass("fe80::528:3c87:e7bb:ab08", 25),
		"proxy_pass http://[fe80::528:3c87:e7bb:ab08]:25;",
	);
	assert.equal(renderLocationProxyPass("::1", 8080), "proxy_pass http://[::1]:8080;");
	assert.equal(renderLocationProxyPass("::1/api", 8080), "proxy_pass http://[::1]:8080/api;");
	assert.equal(renderLocationProxyPass("2001:db8::1", 443, "/health"), "proxy_pass http://[2001:db8::1]:443/health;");
});

test("ipv4, hostnames, and already bracketed addresses are left unchanged", () => {
	assert.equal(renderLocationProxyPass("192.168.1.10", 8080), "proxy_pass http://192.168.1.10:8080;");
	assert.equal(renderLocationProxyPass("backend.internal", 80), "proxy_pass http://backend.internal:80;");
	assert.equal(renderLocationProxyPass("example.com/api", 80), "proxy_pass http://example.com:80/api;");
	assert.equal(renderLocationProxyPass("[::1]", 8080), "proxy_pass http://[::1]:8080;");
});
