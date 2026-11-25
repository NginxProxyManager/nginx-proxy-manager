import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, it } from "node:test";
import { CONFIG_VERSION_MARKER, locationDnsMarker } from "../lib/nginx-locations.js";
import { createModeResolver } from "../lib/upstream-dns.js";
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

const insertProxyHost = async (id, meta, dnsMarker = locationDnsMarker(createModeResolver())) => {
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
	fs.writeFileSync(path.join(dir, `${id}.conf`), `${CONFIG_VERSION_MARKER}\n${dnsMarker}\nserver {}\n`);
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

it("configures proxy hosts again whose config was written for another dynamic DNS setting", async () => {
	const saved = process.env.NPM_LOCATION_DYNAMIC_DNS;
	process.env.NPM_LOCATION_DYNAMIC_DNS = "false";
	const okMeta = {
		nginx_online: true,
		nginx_locations: [{ index: 0, path: "/loc", status: "ok", mode: "dynamic", message: null }],
	};
	// written while dynamic DNS was on, then NPM restarted with NPM_LOCATION_DYNAMIC_DNS=false
	await insertProxyHost(11, okMeta, "# npm-location-dns: dynamic");
	// already written for the current setting
	await insertProxyHost(12, okMeta, "# npm-location-dns: static");
	// written before the setting was recorded
	await insertProxyHost(13, okMeta, "");

	const configured = [];
	const stubs = {
		getConfigName: internalNginx.getConfigName,
		configureHost: internalNginx.configureHost,
		reloadNginx: internalNginx.reloadNginx,
		restoreStaleAside: internalNginx.restoreStaleAside,
	};
	internalNginx.getConfigName = (_hostType, id) => path.join(dir, `${id}.conf`);
	internalNginx.restoreStaleAside = () => {};
	internalNginx.configureHost = async (_model, _hostType, row) => {
		configured.push(row.id);
		return { nginx_online: true, nginx_locations: [{ index: 0, path: "/loc", status: "ok", mode: "static" }] };
	};
	internalNginx.reloadNginx = async () => {};
	try {
		await internalNginx.reconcile();
		assert.deepEqual(
			configured.filter((id) => id > 10),
			[11, 13],
		);
	} finally {
		Object.assign(internalNginx, stubs);
		if (typeof saved === "undefined") {
			delete process.env.NPM_LOCATION_DYNAMIC_DNS;
		} else {
			process.env.NPM_LOCATION_DYNAMIC_DNS = saved;
		}
	}
});

it("records the dynamic DNS setting in the config of a proxy host with locations", async () => {
	const host = {
		id: 21,
		enabled: 1,
		domain_names: ["h21.example.com"],
		forward_scheme: "http",
		forward_host: "app",
		forward_port: 80,
		access_list_id: 0,
		certificate_id: 0,
		advanced_config: "",
		meta: {},
		locations: [location],
	};
	const getConfigName = internalNginx.getConfigName;
	internalNginx.getConfigName = (_hostType, id) => path.join(dir, `${id}.conf`);
	try {
		const states = [{ index: 0, path: "/loc", status: "ok", mode: "static" }];
		const resolver = (dynamicEnabled, hasResolver) =>
			Object.assign(async () => ({ mode: "static", status: "ok" }), { dynamicEnabled, hasResolver });
		let text = await internalNginx.generateConfig("proxy_host", host, {
			locationStates: states,
			modeResolver: resolver(true, true),
		});
		assert.match(text, /^# npm-location-dns: dynamic$/m);
		text = await internalNginx.generateConfig("proxy_host", host, {
			locationStates: states,
			modeResolver: resolver(false, true),
		});
		assert.match(text, /^# npm-location-dns: static$/m);
		assert.doesNotMatch(text, /npm-location-dns: dynamic/);
		// no locations, nothing depends on the setting
		text = await internalNginx.generateConfig("proxy_host", { ...host, locations: [] });
		assert.doesNotMatch(text, /npm-location-dns/);
	} finally {
		internalNginx.getConfigName = getConfigName;
	}
});
