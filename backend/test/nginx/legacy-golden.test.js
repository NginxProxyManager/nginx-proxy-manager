import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";
import { buildProxyHostCandidate } from "../../internal/nginx-config-renderer.js";

const fixture = new URL("./fixtures/legacy-default-proxy-host.json", import.meta.url);
const golden = new URL("./fixtures/legacy-default-proxy-host.conf", import.meta.url);

test("GOLDEN-001 untouched legacy-compatible proxy host renders the reviewed baseline", async () => {
	const host = JSON.parse(await readFile(fixture, "utf8"));
	const expected = (await readFile(golden, "utf8")).replaceAll("\r\n", "\n");
	const actual = await buildProxyHostCandidate({ host });
	assert.equal(actual.config, expected);
});
