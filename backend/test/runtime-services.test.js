import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const testRoot = await mkdtemp(path.join(os.tmpdir(), "npm-runtime-test-"));
process.env.NPM_KEYS_FILE = path.join(testRoot, "keys.json");
process.env.DB_SQLITE_FILE = path.join(testRoot, "database.sqlite");
process.env.NPM_IP_RANGES_FILE = path.join(testRoot, "ip_ranges.conf");

const [
	{ default: utils },
	{ default: ipRanges },
	{ default: internalNginx },
	{ default: coordinator },
] = await Promise.all([
	import("../lib/utils.js"),
	import("../internal/ip_ranges.js"),
	import("../internal/nginx.js"),
	import("../internal/nginx-deployment-coordinator.js"),
]);

test("command utilities handle output, stderr, failures and row omission", async () => {
	assert.equal(await utils.exec(`"${process.execPath}" -e "process.stdout.write('exec-ok')"`), "exec-ok");
	await assert.rejects(() => utils.exec(`"${process.execPath}" -e "process.stderr.write('bad');process.exit(2)"`), /bad/);
	assert.equal(await utils.execFile(process.execPath, ["-e", "process.stdout.write(' file-ok ')"]), "file-ok");
	await assert.rejects(
		() => utils.execFile(process.execPath, ["-e", "process.stderr.write('file-bad');process.exit(3)"]),
		(error) => Boolean(error.message.includes("file-bad") && error.previous),
	);
	assert.deepEqual(
		await utils.execFileResult(process.execPath, ["-e", "process.stdout.write(' out ');process.stderr.write(' err ')"]),
		{ stdout: "out", stderr: "err" },
	);
	await assert.rejects(
		() => utils.execFileResult(process.execPath, ["-e", "process.stdout.write('partial');process.stderr.write('failed');process.exit(4)"]),
		(error) => error.stdout === "partial" && error.stderr === "failed",
	);
	assert.deepEqual(utils.omitRow(["secret"])({ id: 1, secret: "hidden" }), { id: 1 });
	assert.deepEqual(utils.omitRows(["secret"])([{ id: 1, secret: "hidden" }, { id: 2, secret: "hidden" }]), [{ id: 1 }, { id: 2 }]);
});

test("render engine emits valid Nginx access rules and ignores incomplete rules", async () => {
	const engine = utils.getRenderEngine();
	assert.equal(await engine.parseAndRender("{{ rule | nginxAccessRule }}", { rule: { directive: "allow", address: "10.0.0.0/8" } }), "allow 10.0.0.0/8;");
	assert.equal(await engine.parseAndRender("{{ rule | nginxAccessRule }}", { rule: { directive: "allow" } }), "");
});

test("IP range service combines providers, writes config, reloads after startup, and recovers failures", async () => {
	const originalFetchUrl = ipRanges.fetchUrl;
	const originalGenerate = ipRanges.generateConfig;
	const originalReload = internalNginx.reload;
	const payloads = [];
	let reloads = 0;
	const responses = [
		JSON.stringify({
			prefixes: [{ service: "CLOUDFRONT", ip_prefix: "1.2.3.0/24" }, { service: "OTHER", ip_prefix: "9.9.9.0/24" }],
			ipv6_prefixes: [{ service: "CLOUDFRONT", ipv6_prefix: "2001:db8::/32" }],
		}),
		"104.16.0.0/13\nnot-an-ip",
		"2606:4700::/32\ninvalid",
	];
	ipRanges.fetchUrl = async () => responses.shift();
	ipRanges.generateConfig = async (ranges) => payloads.push(ranges);
	internalNginx.reload = async () => { reloads += 1; };
	ipRanges.interval_processing = false;
	ipRanges.iteration_count = 0;
	try {
		await ipRanges.fetch();
		assert.deepEqual(payloads[0], ["1.2.3.0/24", "2001:db8::/32", "104.16.0.0/13", "2606:4700::/32"]);
		assert.equal(reloads, 0);

		responses.push(JSON.stringify({ prefixes: [], ipv6_prefixes: [] }), "104.16.0.0/13", "2606:4700::/32");
		await ipRanges.fetch();
		assert.equal(reloads, 1);
		ipRanges.interval_processing = true;
		assert.equal(ipRanges.fetch(), undefined);
		ipRanges.interval_processing = false;
		ipRanges.fetchUrl = async () => { throw new Error("offline"); };
		await ipRanges.fetch();
		assert.equal(ipRanges.interval_processing, false);
	} finally {
		ipRanges.fetchUrl = originalFetchUrl;
		ipRanges.generateConfig = originalGenerate;
		internalNginx.reload = originalReload;
	}
});

test("IP range config rendering writes the configured destination and reports template failures", async () => {
	await ipRanges.generateConfig(["1.2.3.0/24", "2001:db8::/32"]);
	const config = await readFile(process.env.NPM_IP_RANGES_FILE, "utf8");
	assert.match(config, /set_real_ip_from 1\.2\.3\.0\/24;/);
	assert.match(config, /set_real_ip_from 2001:db8::\/32;/);

	const originalEngine = utils.getRenderEngine;
	utils.getRenderEngine = () => ({ parseAndRender: async () => { throw new Error("render failed"); } });
	try {
		await assert.rejects(() => ipRanges.generateConfig([]), /render failed/);
	} finally {
		utils.getRenderEngine = originalEngine;
	}
});

test("Nginx facade delegates deployment lifecycle and persists success/failure metadata", async () => {
	const originals = {
		deploy: coordinator.deploy,
		remove: coordinator.remove,
		testOnly: coordinator.testOnly,
		reloadOnly: coordinator.reloadOnly,
	};
	const patches = [];
	const model = {
		tableName: "proxy_host",
		query: () => ({ where: () => ({ patch: async (value) => patches.push(value) }) }),
	};
	const host = { id: 7, owner_user_id: 9, meta: { existing: true }, nginx_config_revision: 3, certificate: {}, access_list: {} };
	try {
		coordinator.deploy = async (options) => {
			assert.equal(options.host, host);
			await options.commitApplied?.({ rendered: { configHash: "hash", snapshot: { config: true } } });
		};
		assert.deepEqual(await internalNginx.configure(model, "proxy_host", host), { existing: true, nginx_online: true, nginx_err: null });
		assert.equal(patches.length, 2);

		coordinator.deploy = async (options) => options.commitFailure?.({ error: new Error("reload failed") });
		await internalNginx.configure(model, "proxy_host", host);
		assert.equal(patches.at(-1).meta.nginx_err, "reload failed");

		let deployments = 0;
		let removals = 0;
		coordinator.deploy = async () => { deployments += 1; };
		coordinator.remove = async () => { removals += 1; };
		await internalNginx.generateConfig("stream", host);
		await internalNginx.deleteConfig("stream", host);
		await internalNginx.bulkGenerateConfigs("stream", [host, host]);
		await internalNginx.bulkDeleteConfigs("stream", [host, host]);
		await internalNginx.bulkGenerateConfigs("stream", null);
		await internalNginx.bulkDeleteConfigs("stream", null);
		assert.equal(deployments, 3);
		assert.equal(removals, 3);

		coordinator.testOnly = async (label) => label;
		coordinator.reloadOnly = async (label) => label;
		assert.equal(await internalNginx.test(), "legacy_test");
		assert.equal(await internalNginx.reload(), "legacy_reload");
		assert.equal(internalNginx.getFileFriendlyHostType("proxy_host"), "proxy_host");
		assert.match(internalNginx.getConfigName("proxy_host", 7), /proxy_host[\\/]7\.conf$/);
		assert.equal(internalNginx.getConfigName("proxy_host", 7), internalNginx.getConfigPath("proxy_host", 7));
	} finally {
		Object.assign(coordinator, originals);
	}
});
