import assert from "node:assert/strict";
import { test } from "node:test";
import * as upstream from "../../backend/lib/upstream-servers.js";

test("upstream names default to automatic and use a canonical spelling", () => {
	for (const input of [undefined, null, ""]) assert.equal(upstream.normalizeUpstreamName(input), null);
	assert.equal(upstream.normalizeUpstreamName("My_Backend-2"), "my_backend-2");
});

test("upstream names reject injection, invalid types and the automatic namespace", () => {
	for (const name of [
		"bad name",
		"a;}",
		"$name",
		"127.0.0.1",
		"a:80",
		"a/b",
		"a\n",
		"npm-7",
		"NPM-8",
		"1app",
		"a".repeat(129),
		7,
		{},
	]) {
		assert.throws(() => upstream.normalizeUpstreamName(name), /Upstream name/);
	}
	assert.equal(upstream.normalizeUpstreamName("a".repeat(128)).length, 128);
});

test("forwarding mode preserves legacy routing and requires servers for explicit upstream routing", () => {
	const servers = [{ host: "app", port: 8080 }];
	assert.equal(upstream.normalizeForwardingMode(undefined, []), "direct");
	assert.equal(upstream.normalizeForwardingMode(null, servers), "upstream");
	assert.equal(upstream.normalizeForwardingMode("direct", servers), "direct");
	assert.equal(upstream.normalizeForwardingMode("upstream", servers), "upstream");
	assert.throws(() => upstream.normalizeForwardingMode("upstream", []), /at least one/);
	assert.throws(() => upstream.normalizeForwardingMode("unknown", servers), /Forwarding mode/);
});
