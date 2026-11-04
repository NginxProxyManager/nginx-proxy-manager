import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { after, before, describe, it } from "node:test";
import { buildAsideWarnings, takePendingCertificate } from "../lib/host-test.js";

/**
 * The "Test config" dry run (internal/nginx.js dryRun()) against a real `nginx -t`.
 *
 * Opt-in: it writes to /data/nginx and /data/logs and needs nginx with NPM's configuration, so it only runs with
 * NPM_TEST_NGINX=1, in a throwaway container of the nginx-full image (nginxproxymanager/nginx-full:certbot-node)
 * set up like the NPM image: docker/rootfs/etc/nginx copied to /etc/nginx (without conf.d/dev.conf), the folders
 * /data/nginx/{proxy_host,redirection_host,dead_host,stream,temp,default_host,default_www,custom}, /data/logs and
 * /run/nginx and /var/cache/nginx/proxy_temp created, and `nginx -t` passing. Run it without network: no database is set up, a query would fail.
 */
const ENABLED = process.env.NPM_TEST_NGINX === "1";

const PROXY_DIR = "/data/nginx/proxy_host";
const GOOD_ID = 9001;
const BROKEN_ID = 9002;
const NEW_DOMAIN = "dry-run-new.example.com";

const md5 = (file) => (fs.existsSync(file) ? createHash("md5").update(fs.readFileSync(file)).digest("hex") : null);

// Every file below /data/nginx and /data/logs with its checksum, except the backend's own log and the logs nginx -t
// opens for the existing hosts (a save opens them too)
const snapshot = () => {
	const files = {};
	const walk = (dir) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const path = `${dir}/${entry.name}`;
			if (entry.isDirectory()) {
				walk(path);
			} else if (!/(proxy-host-900[12]_(access|error)|backend)\.log$/.test(path)) {
				files[path] = md5(path);
			}
		}
	};
	walk("/data/nginx");
	walk("/data/logs");
	return files;
};

const leftovers = () =>
	Object.keys(snapshot()).filter((file) => file.includes("npm-dry-run") || file.endsWith(".npm-aside"));

const serverBlock = (id, name, extra = "") =>
	`server {\n  listen 80;\n  server_name ${name};\n  access_log /data/logs/proxy-host-${id}_access.log;\n${extra}  location / { return 200; }\n}\n`;

const proxyHost = (id, extra = {}) =>
	Object.assign(
		{
			id,
			domain_names: [NEW_DOMAIN],
			forward_scheme: "http",
			forward_host: "127.0.0.1",
			forward_port: 8080,
			advanced_config: "",
			locations: [],
			meta: {},
			enabled: true,
			certificate_id: 0,
			certificate: null,
			access_list_id: 0,
			access_list: null,
			ssl_forced: false,
			http2_support: false,
			hsts_enabled: false,
			hsts_subdomains: false,
			block_exploits: false,
			caching_enabled: false,
			allow_websocket_upgrade: false,
		},
		extra,
	);

describe("Config test dry run with nginx", { skip: ENABLED ? false : "set NPM_TEST_NGINX=1 to run" }, () => {
	let nginx;
	let hostTest;
	let queries = 0;
	// The test must not read or write the database through the host's model
	const model = {
		query: () => {
			queries++;
			throw new Error("The dry run used the database");
		},
	};

	before(async () => {
		process.env.DB_SQLITE_FILE = "/tmp/npm-dry-run-test-unused.sqlite";
		nginx = (await import("../internal/nginx.js")).default;
		hostTest = (await import("../internal/host-test.js")).default;
		fs.writeFileSync(`${PROXY_DIR}/${GOOD_ID}.conf`, serverBlock(GOOD_ID, "dry-run-good.example.com"));
		fs.writeFileSync(
			`${PROXY_DIR}/${BROKEN_ID}.conf`,
			serverBlock(BROKEN_ID, "dry-run-broken.example.com", "  this_is_not_a_directive on;\n"),
		);
		fs.writeFileSync(`${PROXY_DIR}/${BROKEN_ID}.conf.err`, "an older rejected config\n");
	});

	after(() => {
		for (const file of [`${GOOD_ID}.conf`, `${BROKEN_ID}.conf`, `${BROKEN_ID}.conf.err`]) {
			fs.rmSync(`${PROXY_DIR}/${file}`, { force: true });
		}
	});

	it("tests a new host without the other host's broken file and puts that file back unchanged", async () => {
		const before = snapshot();
		const broken = md5(`${PROXY_DIR}/${BROKEN_ID}.conf`);
		const brokenErr = md5(`${PROXY_DIR}/${BROKEN_ID}.conf.err`);

		const dry = await nginx.dryRun(model, "proxy_host", proxyHost(nginx.DRY_RUN_ID));
		assert.equal(dry.error, null);
		assert.equal(dry.meta.nginx_online, true);
		assert.deepEqual(
			dry.aside.map((other) => [other.host_type, other.host_id]),
			[["proxy_host", BROKEN_ID]],
		);
		assert.match(dry.aside[0].message, /this_is_not_a_directive/);

		const warnings = await buildAsideWarnings(dry.aside, async () => true);
		assert.equal(warnings[0].code, "other_host_broken");
		assert.equal(warnings[0].host_id, BROKEN_ID);

		assert.equal(md5(`${PROXY_DIR}/${BROKEN_ID}.conf`), broken);
		assert.equal(md5(`${PROXY_DIR}/${BROKEN_ID}.conf.err`), brokenErr);
		assert.deepEqual(snapshot(), before);
		assert.deepEqual(leftovers(), []);
		assert.equal(queries, 0);
		assert.equal(fs.existsSync(process.env.DB_SQLITE_FILE), false);
	});

	it("reports a rejected new host and an edit without changing any file", async () => {
		const before = snapshot();

		const rejected = await nginx.dryRun(
			model,
			"proxy_host",
			proxyHost(nginx.DRY_RUN_ID, { advanced_config: "nonsense_directive on;" }),
		);
		assert.ok(rejected.error);
		assert.match(rejected.error.message, /nonsense_directive/);

		const edit = await nginx.dryRun(
			model,
			"proxy_host",
			proxyHost(GOOD_ID, {
				domain_names: ["dry-run-good.example.com"],
				advanced_config: "nonsense_directive on;",
			}),
		);
		assert.ok(edit.error);

		const ok = await nginx.dryRun(
			model,
			"proxy_host",
			proxyHost(GOOD_ID, { domain_names: ["dry-run-good.example.com"] }),
		);
		assert.equal(ok.error, null);

		assert.deepEqual(snapshot(), before);
		assert.deepEqual(leftovers(), []);
		assert.equal(queries, 0);
	});

	it('checks an edit with certificate_id "new" without the stored certificate', async () => {
		// The stored host uses a certificate whose files are gone; the user requests a new one
		const row = proxyHost(GOOD_ID, {
			domain_names: ["dry-run-good.example.com"],
			certificate_id: 999999,
			certificate: { id: 999999, provider: "other", meta: {} },
			ssl_forced: true,
			http2_support: true,
			hsts_enabled: true,
		});
		const type = { get: async () => row, expand: [] };
		const access = { token: { getUserId: () => 1 } };

		const input = { certificate_id: "new", ssl_forced: true, http2_support: true, hsts_enabled: true };
		assert.equal(takePendingCertificate(input)[0].code, "certificate_pending");
		const host = await hostTest.buildHost(access, type, "proxy_host", GOOD_ID, input);
		assert.equal(host.certificate_id, 0);
		assert.equal(host.certificate, null);
		assert.equal(host.ssl_forced, false);
		assert.equal(host.http2_support, false);
		assert.equal(host.hsts_enabled, false);

		const before = snapshot();
		const dry = await nginx.dryRun(model, "proxy_host", host);
		assert.equal(dry.error, null);
		assert.deepEqual(snapshot(), before);

		// Deleting certificate_id instead of zeroing it would bring back the stored certificate
		const stale = await hostTest.buildHost(access, type, "proxy_host", GOOD_ID, {
			ssl_forced: true,
			http2_support: true,
		});
		assert.equal(stale.certificate_id, 999999);
		assert.equal(queries, 0);
	});
});
