// Users who aren't admins may not change the advanced config of a custom location. Configs are matched by value
// (internalHost.assertLocationAdvancedConfigUnchanged): a location may keep or carry an admin-written config, or
// none, but not a new one or a copy. A location sent without one keeps the config of the saved location at its path;
// switched off locations, trimmed paths and repeated regex paths (the n-th to the n-th saved one) must not make an
// unchanged advanced config look changed (or let a change through).
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { access, db, load, ts, userAccess } from "./support/backend.js";

const errs = await load("lib/error.js");
const internalNginx = await load("internal/nginx.js");
const internalAuditLog = await load("internal/audit-log.js");
const internalProxyHost = await load("internal/proxy-host.js");

const original = {};
let configures = 0;

before(() => {
	original.configure = internalNginx.configure;
	original.audit = internalAuditLog.add;
	internalAuditLog.add = async () => {};
	internalNginx.configure = async () => {
		configures++;
		return { nginx_online: true };
	};
});

after(async () => {
	internalNginx.configure = original.configure;
	internalAuditLog.add = original.audit;
	await db.destroy();
});

const location = (path, advanced_config = "", extra = {}) => ({
	path,
	forward_scheme: "http",
	forward_host: "app",
	forward_port: 80,
	advanced_config,
	...extra,
});

const savedLocations = [
	location("/api", "proxy_set_header X-Api 1;"),
	location("~ ^/img", "expires 1d;"),
	location("~ ^/img", "expires 7d;"),
	location("/off", "add_header X-Off 1;", { enabled: false }),
];

let nextId = 1;
const insertHost = async (locations = savedLocations) => {
	const id = nextId++;
	await db("proxy_host").insert({
		id,
		owner_user_id: 1,
		domain_names: JSON.stringify([`h${id}.example.com`]),
		forward_scheme: "http",
		forward_host: "app",
		forward_port: 80,
		access_list_id: 0,
		certificate_id: 0,
		advanced_config: "",
		locations: JSON.stringify(locations),
		meta: "{}",
		...ts,
	});
	return id;
};
const savedOf = async (id) => JSON.parse((await db("proxy_host").where("id", id).first()).locations);
const advancedOf = async (id) => (await savedOf(id)).map((l) => l.advanced_config);

describe("proxy host update: custom location advanced config of a user who isn't an admin", () => {
	const user = userAccess();

	beforeEach(() => {
		configures = 0;
	});

	it("lets the locations be saved unchanged, including repeated regex paths and switched off ones", async () => {
		const id = await insertHost();
		await internalProxyHost.update(user, { id, locations: savedLocations.map((l) => ({ ...l })) });
		assert.deepEqual(await advancedOf(id), savedLocations.map((l) => l.advanced_config));
	});

	it("lets a location be switched on or off and its upstream be changed", async () => {
		const id = await insertHost();
		const locations = savedLocations.map((l) => ({ ...l }));
		locations[3].enabled = true;
		locations[2].forward_host = "other";
		await internalProxyHost.update(user, { id, locations });
		const saved = await savedOf(id);
		assert.equal(saved[3].enabled, true);
		assert.equal(saved[2].forward_host, "other");
		assert.equal(saved[2].advanced_config, "expires 7d;");
	});

	it("keeps the saved advanced config of locations sent without one", async () => {
		const id = await insertHost();
		const locations = savedLocations.map(({ advanced_config, ...l }) => l);
		await internalProxyHost.update(user, { id, locations });
		assert.deepEqual(await advancedOf(id), savedLocations.map((l) => l.advanced_config));
	});

	it("matches a location whose saved path has spaces around it", async () => {
		const id = await insertHost([location(" /api ", "proxy_set_header X-Api 1;")]);
		await internalProxyHost.update(user, { id, locations: [location("/api", "proxy_set_header X-Api 1;")] });
		assert.deepEqual(await advancedOf(id), ["proxy_set_header X-Api 1;"]);
	});

	it("lets two locations with the same regex path swap their admin-written configs", async () => {
		const id = await insertHost();
		const locations = savedLocations.map((l) => ({ ...l }));
		locations[1].advanced_config = "expires 7d;";
		locations[2].advanced_config = "expires 1d;";
		await internalProxyHost.update(user, { id, locations });
		assert.deepEqual(await advancedOf(id), ["proxy_set_header X-Api 1;", "expires 7d;", "expires 1d;", "add_header X-Off 1;"]);
	});

	it("keeps the config of a renamed location, and allows clearing one", async () => {
		const id = await insertHost();
		const locations = savedLocations.map((l) => ({ ...l }));
		locations[0].path = "/v2/api";
		locations[1].advanced_config = "";
		await internalProxyHost.update(user, { id, locations });
		assert.deepEqual(await advancedOf(id), ["proxy_set_header X-Api 1;", "", "expires 7d;", "add_header X-Off 1;"]);
	});

	it("refuses copying an admin-written config onto another location", async () => {
		const id = await insertHost();
		const locations = savedLocations.map((l) => ({ ...l }));
		locations[1].advanced_config = "expires 7d;";
		await assert.rejects(internalProxyHost.update(user, { id, locations }), errs.PermissionError);
		const added = [...savedLocations.map((l) => ({ ...l })), location("/copy", "proxy_set_header X-Api 1;")];
		await assert.rejects(internalProxyHost.update(user, { id, locations: added }), errs.PermissionError);
		assert.equal(configures, 0);
		assert.deepEqual(await advancedOf(id), savedLocations.map((l) => l.advanced_config));
	});

	it("gives the n-th location with a repeated regex path the config of the n-th saved one when it omits it", async () => {
		const id = await insertHost();
		const locations = savedLocations.map((l) => ({ ...l }));
		delete locations[2].advanced_config;
		await internalProxyHost.update(user, { id, locations });
		assert.deepEqual(await advancedOf(id), savedLocations.map((l) => l.advanced_config));
	});

	it("refuses an advanced config on a switched off location, or on a new one", async () => {
		const id = await insertHost();
		const changed = savedLocations.map((l) => ({ ...l }));
		changed[3].advanced_config = "return 200;";
		await assert.rejects(internalProxyHost.update(user, { id, locations: changed }), errs.PermissionError);
		const added = [...savedLocations.map((l) => ({ ...l })), location("~ ^/img", "expires 30d;")];
		await assert.rejects(internalProxyHost.update(user, { id, locations: added }), errs.PermissionError);
		assert.equal(configures, 0);
	});

	it("lets an admin change them", async () => {
		const id = await insertHost();
		const locations = savedLocations.map((l) => ({ ...l, advanced_config: "" }));
		await internalProxyHost.update(access, { id, locations });
		assert.deepEqual(await advancedOf(id), ["", "", "", ""]);
	});
});
