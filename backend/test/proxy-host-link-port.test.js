import assert from "node:assert/strict";
import { it } from "node:test";
import { getProxyHostLinkHttpsPort } from "../lib/config.js";

it("accepts only valid external HTTPS ports for Proxy Host links", (t) => {
	const variable = "PROXY_HOST_LINK_HTTPS_PORT";
	const previous = process.env[variable];
	t.after(() => {
		if (previous === undefined) {
			delete process.env[variable];
		} else {
			process.env[variable] = previous;
		}
	});

	delete process.env[variable];
	assert.equal(getProxyHostLinkHttpsPort(), undefined);
	for (const [value, expected] of [
		["4443", 4443],
		["443", 443],
		["1", 1],
		["65535", 65535],
		["", undefined],
		["0", undefined],
		["65536", undefined],
		["-1", undefined],
		["4e3", undefined],
		["4443/path", undefined],
	]) {
		process.env[variable] = value;
		assert.equal(getProxyHostLinkHttpsPort(), expected, value);
	}
});
