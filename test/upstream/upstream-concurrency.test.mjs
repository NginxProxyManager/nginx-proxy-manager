import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { normalizeUpstreamServers } from "../../backend/lib/upstream-servers.js";

const deferred = () => {
	let resolve;
	const promise = new Promise((done) => {
		resolve = done;
	});
	return { promise, resolve };
};

const loadService = async (t) => {
	// Import the real service without reading or creating deployment credentials.
	const exists = fs.existsSync;
	const read = fs.readFileSync;
	t.mock.method(fs, "existsSync", (file) => file === "/data/keys.json" || exists(file));
	t.mock.method(fs, "readFileSync", (file, ...args) =>
		file === "/data/keys.json" ? '{"key":"test","pub":"test"}' : read(file, ...args),
	);
	const { default: service } = await import("../../backend/internal/proxy-host.js");
	const { default: model } = await import("../../backend/models/proxy_host.js");
	const { default: audit } = await import("../../backend/internal/audit-log.js");
	const { default: host } = await import("../../backend/internal/host.js");
	const { default: nginx } = await import("../../backend/internal/nginx.js");
	const { default: db } = await import("../../backend/db.js");
	t.after(() => db().destroy());
	return { service, model, audit, host, nginx };
};

test("concurrent partial updates validate against the last committed upstream configuration", {
	timeout: 5000,
}, async (t) => {
	const { service, model, audit } = await loadService(t);
	const pool = [{ host: "primary.internal", port: 80 }];
	let row = {
		id: 71,
		enabled: false,
		domain_names: ["test.internal"],
		lb_method: "round_robin",
		forwarding_mode: "upstream",
		upstream_servers: pool,
		certificate_id: 0,
	};
	const entered = deferred();
	const release = deferred();
	t.after(() => release.resolve());
	t.mock.method(service, "get", async () => structuredClone(row));
	t.mock.method(audit, "add", async () => true);
	t.mock.method(model, "query", () => ({
		where() {
			return this;
		},
		async patch(data) {
			if (data.lb_method === "ip_hash") {
				entered.resolve();
				await release.promise;
			}
			row = { ...row, ...structuredClone(data) };
			return 1;
		},
	}));
	const access = { can: async () => ({ permission_visibility: "all" }) };
	const first = service.update(access, { id: row.id, lb_method: "ip_hash" });
	await entered.promise;
	const second = service.update(access, {
		id: row.id,
		upstream_servers: [...pool, { host: "backup.internal", port: 80, backup: true }],
	});
	const results = Promise.allSettled([first, second]);
	// Let the competing request reach the read/validation/patch path if it is unlocked.
	await setImmediate();
	release.resolve();
	const settled = await results;
	assert.equal(settled[0].status, "fulfilled", "the first update must succeed");
	assert.equal(settled[1].status, "rejected", "the incompatible second update must fail");
	assert.match(settled[1].reason.message, /backup.*ip_hash/);
	assert.equal(row.lb_method, "ip_hash");
	assert.deepEqual(row.upstream_servers, pool, "rejected update must not change the server list");
	assert.doesNotThrow(() => normalizeUpstreamServers(row.upstream_servers, row.lb_method));
});

test("unrelated partial updates preserve automatic legacy forwarding mode", { timeout: 5000 }, async (t) => {
	const { service, model, audit } = await loadService(t);
	let row = {
		id: 72,
		enabled: false,
		domain_names: ["legacy.internal"],
		lb_method: "round_robin",
		forwarding_mode: null,
		upstream_servers: [{ host: "primary.internal", port: 80 }],
		certificate_id: 0,
	};
	t.mock.method(service, "get", async () => structuredClone(row));
	t.mock.method(audit, "add", async () => true);
	t.mock.method(model, "query", () => ({
		where() {
			return this;
		},
		async patch(data) {
			row = { ...row, ...structuredClone(data) };
			return 1;
		},
	}));
	const access = { can: async () => ({ permission_visibility: "all" }) };
	await service.update(access, { id: row.id, advanced_config: "# unrelated" });
	assert.equal(row.forwarding_mode, null);
	await service.update(access, { id: row.id, upstream_servers: [] });
	assert.equal(row.forwarding_mode, null);
	assert.deepEqual(row.upstream_servers, []);
});

test("delete waits for an in-flight rename and releases the final upstream name", { timeout: 5000 }, async (t) => {
	const { service, model, audit } = await loadService(t);
	const { default: nginx } = await import("../../backend/internal/nginx.js");
	let row = {
		id: 73,
		enabled: false,
		is_deleted: 0,
		domain_names: ["delete.internal"],
		upstream_name: "old_name",
		lb_method: "round_robin",
		forwarding_mode: "direct",
		upstream_servers: [],
		certificate_id: 0,
	};
	const entered = deferred();
	const release = deferred();
	t.after(() => release.resolve());
	t.mock.method(service, "get", async () => {
		if (row.is_deleted) throw new Error("not found");
		return structuredClone(row);
	});
	t.mock.method(audit, "add", async () => true);
	t.mock.method(nginx, "deleteConfig", async () => true);
	t.mock.method(nginx, "reload", async () => true);
	t.mock.method(model, "query", () => ({
		where() {
			return this;
		},
		async patch(data) {
			if (data.upstream_name === "new_name") {
				entered.resolve();
				await release.promise;
			}
			row = { ...row, ...structuredClone(data) };
			return 1;
		},
	}));
	const access = { can: async () => ({ permission_visibility: "all" }) };
	const update = service.update(access, { id: row.id, upstream_name: "new_name" });
	await entered.promise;
	const deletion = service.delete(access, { id: row.id });
	const settled = Promise.allSettled([update, deletion]);
	await setImmediate();
	release.resolve();
	const results = await settled;
	assert.equal(
		results.every((result) => result.status === "fulfilled"),
		true,
	);
	assert.equal(row.is_deleted, 1);
	assert.equal(row.upstream_name, null);
});

test("create holds the host lifecycle until configuration completes", { timeout: 5000 }, async (t) => {
	const { service, model, audit, host, nginx } = await loadService(t);
	const configureEntered = deferred();
	const releaseConfigure = deferred();
	t.after(() => releaseConfigure.resolve());
	const deletePatched = deferred();
	const configuredMeta = { nginx_online: true, nginx_err: null };
	let liveConfig = false;
	let row;

	t.mock.method(host, "isHostnameTaken", async () => ({ is_taken: false }));
	t.mock.method(host, "cleanSslHstsData", (data) => data);
	t.mock.method(service, "get", async () => {
		if (!row || row.is_deleted) throw new Error("Proxy Host is deleted");
		return structuredClone(row);
	});
	t.mock.method(audit, "add", async () => true);
	t.mock.method(model, "query", () => ({
		where() {
			return this;
		},
		async insertAndFetch(data) {
			row = {
				id: 73,
				enabled: true,
				meta: {},
				certificate_id: 0,
				...structuredClone(data),
			};
			return structuredClone(row);
		},
		async patch(data) {
			row = { ...row, ...structuredClone(data) };
			if (data.is_deleted) deletePatched.resolve();
			return 1;
		},
	}));
	t.mock.method(nginx, "configure", async () => {
		configureEntered.resolve();
		await releaseConfigure.promise;
		liveConfig = true;
		return configuredMeta;
	});
	t.mock.method(nginx, "deleteConfig", async () => {
		liveConfig = false;
	});
	t.mock.method(nginx, "reload", async () => true);

	const access = {
		can: async () => ({ permission_visibility: "all" }),
		token: { getUserId: () => 1 },
	};
	const creating = service.create(access, {
		domain_names: ["create-race.internal"],
		forward_scheme: "http",
		forward_host: "127.0.0.1",
		forward_port: 8080,
		upstream_name: "create_race",
		upstream_servers: [{ host: "127.0.0.1", port: 8080 }],
		forwarding_mode: "upstream",
	});
	await configureEntered.promise;

	const deleting = service.delete(access, { id: row.id });
	await setImmediate();
	assert.equal(row.is_deleted, undefined, "delete must wait while create is configuring the host");

	releaseConfigure.resolve();
	const created = await creating;
	await deleting;
	await deletePatched.promise;

	assert.deepEqual(created.meta, {}, "create response must preserve the existing API metadata contract");
	assert.equal(row.is_deleted, 1);
	assert.equal(row.upstream_name, null);
	assert.equal(liveConfig, false, "delete must remove the config after create finishes writing it");
});

test("bulk regeneration waits for host updates and renders fresh state", { timeout: 5000 }, async (t) => {
	const { model, nginx } = await loadService(t);
	const { withProxyHostLock } = await import("../../backend/lib/upstream-name-lock.js");
	let row = { id: 81, enabled: true, is_deleted: false, upstream_name: "old_pool" };
	const stale = structuredClone(row);
	const entered = deferred();
	const release = deferred();
	t.after(() => release.resolve());
	const rendered = [];
	t.mock.method(model, "query", () => ({
		where() {
			return this;
		},
		withGraphFetched() {
			return this;
		},
		async first() {
			return structuredClone(row);
		},
	}));
	t.mock.method(nginx, "generateConfig", async (_type, host) => rendered.push(host.upstream_name));
	const update = withProxyHostLock(async () => {
		entered.resolve();
		await release.promise;
		row.upstream_name = "new_pool";
	})(null, row);
	await entered.promise;
	const regeneration = nginx.bulkGenerateProxyHostConfigs([stale]);
	await setImmediate();
	const beforeRelease = [...rendered];
	release.resolve();
	await Promise.all([update, regeneration]);
	assert.deepEqual(beforeRelease, [], "regeneration must wait for the host lock");
	assert.deepEqual(rendered, ["new_pool"], "stale caller snapshots must not overwrite the new name");
});

test("bulk regeneration cannot restore deleted or disabled proxy hosts", async (t) => {
	const { model, nginx } = await loadService(t);
	let row;
	const rendered = [];
	t.mock.method(model, "query", () => ({
		where() {
			return this;
		},
		withGraphFetched() {
			return this;
		},
		async first() {
			return row;
		},
	}));
	t.mock.method(nginx, "generateConfig", async (_type, host) => rendered.push(host));
	for (const current of [undefined, { id: 82, enabled: false }, { id: 82, enabled: true, is_deleted: true }]) {
		row = current;
		await nginx.bulkGenerateProxyHostConfigs([{ id: 82, enabled: true }]);
	}
	assert.deepEqual(rendered, []);
});

test("certificate restoration rereads proxy hosts and can run inside their lifecycle lock", {
	timeout: 5000,
}, async (t) => {
	const { model, nginx } = await loadService(t);
	const { default: certificate } = await import("../../backend/internal/certificate.js");
	const { withProxyHostLock } = await import("../../backend/lib/upstream-name-lock.js");
	let row = { id: 83, enabled: true, upstream_name: "current_pool" };
	const rendered = [];
	t.mock.method(model, "query", () => ({
		where() {
			return this;
		},
		withGraphFetched() {
			return this;
		},
		async first() {
			return row;
		},
	}));
	t.mock.method(nginx, "generateConfig", async (_type, host) => rendered.push(host.upstream_name));
	const snapshot = {
		total_count: 1,
		proxy_hosts: [{ id: 83, enabled: true, upstream_name: "stale_pool" }],
		redirection_hosts: [],
		dead_hosts: [],
	};
	await withProxyHostLock(() => certificate.enableInUseHosts(snapshot))(null, { id: 83 });
	assert.deepEqual(rendered, ["current_pool"]);
	row = undefined;
	await certificate.enableInUseHosts(snapshot);
	assert.deepEqual(rendered, ["current_pool"], "certificate restoration must not recreate deleted hosts");
});

test("requesting a new certificate during a proxy update completes its restore and save", {
	timeout: 5000,
}, async (t) => {
	const { service, model, audit, host, nginx } = await loadService(t);
	const { default: certificate } = await import("../../backend/internal/certificate.js");
	let row = {
		id: 84,
		enabled: true,
		domain_names: ["cert.internal"],
		certificate_id: 0,
		meta: {},
		upstream_name: "cert_pool",
		upstream_servers: [{ host: "127.0.0.1", port: 8080 }],
		forwarding_mode: "upstream",
	};
	const events = [];
	t.mock.method(service, "get", async () => structuredClone(row));
	t.mock.method(host, "cleanSslHstsData", (data) => data);
	t.mock.method(host, "cleanRowCertificateMeta", (data) => data);
	t.mock.method(audit, "add", async () => true);
	t.mock.method(model, "query", () => ({
		where() {
			return this;
		},
		withGraphFetched() {
			return this;
		},
		async first() {
			return structuredClone(row);
		},
		async patch(data) {
			row = { ...row, ...data };
			return 1;
		},
	}));
	t.mock.method(nginx, "generateConfig", async () => events.push("restored"));
	t.mock.method(nginx, "configure", async () => {
		events.push("configured");
		return {};
	});
	t.mock.method(certificate, "createQuickCertificate", async () => {
		await certificate.enableInUseHosts({
			total_count: 1,
			proxy_hosts: [structuredClone(row)],
			redirection_hosts: [],
			dead_hosts: [],
		});
		return { id: 101 };
	});
	const updated = await service.update({ can: async () => ({}) }, { id: 84, certificate_id: "new" });
	assert.equal(updated.certificate_id, 101);
	assert.deepEqual(events, ["restored", "configured"]);
});
