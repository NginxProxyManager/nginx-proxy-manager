import assert from "node:assert/strict";
import test from "node:test";
import reconfigureDefaultSite from "../internal/default-site.js";

test("default-site reconfiguration returns the updated setting", async () => {
	const calls = [];
	const row = { id: "default-site", value: "404", meta: {} };
	const nginx = {
		deleteConfig: async (hostType) => calls.push(["deleteConfig", hostType]),
		generateConfig: async (hostType, setting) => calls.push(["generateConfig", hostType, setting]),
		test: async () => calls.push(["test"]),
		reload: async () => calls.push(["reload"]),
	};

	assert.equal(await reconfigureDefaultSite(row, nginx), row);
	assert.deepEqual(calls, [
		["deleteConfig", "default"],
		["generateConfig", "default", row],
		["test"],
		["reload"],
	]);
});

test("default-site reconfiguration propagates a public API error after recovery", async () => {
	const calls = [];
	const row = { id: "default-site", value: "404", meta: {} };
	const nginx = {
		deleteConfig: async (hostType) => calls.push(["deleteConfig", hostType]),
		generateConfig: async () => {
			calls.push(["generateConfig"]);
			throw new Error("invalid generated config");
		},
		test: async () => calls.push(["test"]),
		reload: async () => calls.push(["reload"]),
	};

	await assert.rejects(
		() => reconfigureDefaultSite(row, nginx),
		(error) => {
			assert.equal(error.message, "Could not reconfigure Nginx. Please check logs.");
			assert.equal(error.status, 400);
			assert.equal(error.public, true);
			assert.equal(error.previous.message, "invalid generated config");
			return true;
		},
	);
	assert.deepEqual(calls, [
		["deleteConfig", "default"],
		["generateConfig"],
		["deleteConfig", "default"],
		["test"],
		["reload"],
	]);
});
