import assert from "node:assert/strict";
import test from "node:test";

import dnsPlugins from "../certbot/dns-plugins.json" with { type: "json" };
import { installPlugin, installPlugins } from "../lib/certbot.js";
import errs from "../lib/error.js";
import utils from "../lib/utils.js";

test("certbot plugin installation validates keys and builds an isolated pip environment", async () => {
	const originalExec = utils.exec;
	const previousVersion = process.env.CERTBOT_VERSION;
	const previousEnv = dnsPlugins.cloudflare.env;
	const calls = [];
	process.env.CERTBOT_VERSION = "9.9.9";
	dnsPlugins.cloudflare.env = { CERTBOT_PLUGIN_TEST: "enabled" };
	utils.exec = async (command, options) => {
		calls.push({ command, options });
		return "installed";
	};

	try {
		await assert.rejects(() => installPlugin("not-a-plugin"), errs.ItemNotFoundError);
		assert.equal(await installPlugin("cloudflare"), "installed");
		assert.equal(calls.length, 1);
		assert.match(calls[0].command, /pip install --no-cache-dir/);
		assert.match(calls[0].command, /certbot-dns-cloudflare/);
		assert.equal(calls[0].options.env.SETUPTOOLS_USE_DISTUTILS, "local");
		assert.equal(calls[0].options.env.CERTBOT_PLUGIN_TEST, "enabled");
	} finally {
		utils.exec = originalExec;
		if (previousEnv === undefined) delete dnsPlugins.cloudflare.env;
		else dnsPlugins.cloudflare.env = previousEnv;
		if (previousVersion === undefined) delete process.env.CERTBOT_VERSION;
		else process.env.CERTBOT_VERSION = previousVersion;
	}
});

test("certbot batch installation handles empty, successful, and failed batches", async () => {
	const originalExec = utils.exec;
	try {
		await installPlugins([]);

		let executions = 0;
		utils.exec = async () => {
			executions += 1;
			return "ok";
		};
		await installPlugins(["acmedns", "active24"]);
		assert.equal(executions, 2);

		utils.exec = async () => {
			throw new Error("pip unavailable");
		};
		await assert.rejects(() => installPlugins(["acmedns"]), errs.CommandError);
	} finally {
		utils.exec = originalExec;
	}
});
