import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, it } from "node:test";
import { CONFIG_VERSION_MARKER } from "../lib/nginx-locations.js";
import { db, load, ts } from "./support/backend.js";

const internalNginx = await load("internal/nginx.js");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "npm-reconcile-"));
after(() => {
	fs.rmSync(dir, { recursive: true, force: true });
	return db.destroy();
});

const location = {
	path: "/loc",
	forward_scheme: "http",
	forward_host: "later.internal",
	forward_port: 80,
	forward_path: "",
	advanced_config: "",
};

const insertProxyHost = async (id, meta) => {
	await db("proxy_host").insert({
		id,
		owner_user_id: 1,
		certificate_id: 0,
		enabled: 1,
		domain_names: JSON.stringify([`h${id}.example.com`]),
		forward_scheme: "http",
		forward_host: "app",
		forward_port: 80,
		access_list_id: 0,
		advanced_config: "",
		locations: JSON.stringify([location]),
		meta: JSON.stringify(meta),
		...ts,
	});
	// an intact config file of the current version: without the stored status there would be nothing to do
	fs.writeFileSync(path.join(dir, `${id}.conf`), `${CONFIG_VERSION_MARKER}\nserver {}\n`);
};

it("configures proxy hosts again whose stored location status is still unresolved, eg. after a restart", async () => {
	await insertProxyHost(1, {
		nginx_online: true,
		nginx_locations: [{ index: 0, path: "/loc", status: "unresolved", mode: "dynamic", message: "x" }],
	});
	await insertProxyHost(2, {
		nginx_online: true,
		nginx_locations: [{ index: 0, path: "/loc", status: "ok", mode: "dynamic", message: null }],
	});

	const configured = [];
	const reloads = [];
	const stubs = {
		getConfigName: internalNginx.getConfigName,
		configureHost: internalNginx.configureHost,
		reloadNginx: internalNginx.reloadNginx,
		restoreStaleAside: internalNginx.restoreStaleAside,
	};
	internalNginx.getConfigName = (_hostType, id) => path.join(dir, `${id}.conf`);
	internalNginx.restoreStaleAside = () => {};
	internalNginx.configureHost = async (_model, hostType, row, opts) => {
		configured.push({ hostType, id: row.id, reload: opts.reload });
		// the name resolves now
		return { nginx_online: true, nginx_locations: [{ index: 0, path: "/loc", status: "ok", mode: "dynamic" }] };
	};
	internalNginx.reloadNginx = async () => {
		reloads.push("reload");
	};
	try {
		const summary = await internalNginx.reconcile();
		assert.deepEqual(configured, [{ hostType: "proxy_host", id: 1, reload: false }]);
		assert.equal(summary.checked, 2);
		assert.equal(summary.regenerated, 1);
		assert.deepEqual(summary.retry, {});
		assert.deepEqual(reloads, ["reload"]);
	} finally {
		Object.assign(internalNginx, stubs);
	}
});
