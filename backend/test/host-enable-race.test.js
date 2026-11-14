import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { access, db, load, tick, ts } from "./support/backend.js";

const errs = await load("lib/error.js");
const internalNginx = await load("internal/nginx.js");
const internalAuditLog = await load("internal/audit-log.js");

// What nginx serves per host type and id: the forward host of an installed config, or null
const served = new Map();
const original = {};

const rejected = () =>
	new errs.NginxConfigError('host not found in upstream "bad"', { kind: "nginx_config", scope: "host" });

// A slow database: the enable's own `enabled: 1` patch lands a little later, which opens the window in which a
// concurrent update reads the row before it and restores it after it.
const slowEnablePatch = (model) => {
	const query = model.query;
	model.query = (...args) => {
		const builder = query.apply(model, args);
		const patch = builder.patch;
		builder.patch = (values) =>
			values && Object.keys(values).length === 1 && values.enabled === 1
				? tick(10).then(() => patch.call(builder, values))
				: patch.call(builder, values);
		return builder;
	};
	return () => {
		model.query = query;
	};
};

after(() => db.destroy());

before(() => {
	original.configure = internalNginx.configure;
	original.removeConfigAndReload = internalNginx.removeConfigAndReload;
	original.audit = internalAuditLog.add;
	internalAuditLog.add = async () => {};
});

beforeEach(() => {
	served.clear();
	// nginx -t takes a while; a rejected config keeps the previous one, like the real configure()
	internalNginx.configure = (_model, hostType, host) =>
		internalNginx.withLock(async () => {
			await tick(20);
			if ((host.forward_host || host.forwarding_host || host.forward_domain_name) === "bad") {
				throw rejected();
			}
			served.set(`${hostType}#${host.id}`, host.enabled ? "good" : null);
			return { nginx_online: true };
		});
	internalNginx.removeConfigAndReload = (hostType, host) =>
		internalNginx.withLock(async () => {
			await tick(5);
			served.set(`${hostType}#${host.id}`, null);
		});
});

afterEach(() => {
	internalNginx.configure = original.configure;
	internalNginx.removeConfigAndReload = original.removeConfigAndReload;
});

const types = [
	{
		name: "proxy host",
		module: "internal/proxy-host.js",
		model: "models/proxy_host.js",
		table: "proxy_host",
		hostType: "proxy_host",
		field: "forward_host",
		row: {
			domain_names: JSON.stringify(["a.example.com"]),
			forward_scheme: "http",
			forward_host: "good",
			forward_port: 80,
			access_list_id: 0,
			advanced_config: "",
			locations: "[]",
		},
	},
	{
		name: "redirection host",
		module: "internal/redirection-host.js",
		model: "models/redirection_host.js",
		table: "redirection_host",
		hostType: "redirection_host",
		field: "forward_domain_name",
		row: {
			domain_names: JSON.stringify(["b.example.com"]),
			forward_scheme: "http",
			forward_domain_name: "good",
			forward_http_code: 301,
			advanced_config: "",
		},
	},
	{
		name: "dead host",
		module: "internal/dead-host.js",
		model: "models/dead_host.js",
		table: "dead_host",
		hostType: "dead_host",
		// dead hosts have no forward host: a bad advanced config stands in for a rejected change
		field: "advanced_config",
		row: { domain_names: JSON.stringify(["c.example.com"]), advanced_config: "" },
	},
	{
		name: "stream",
		module: "internal/stream.js",
		model: "models/stream.js",
		table: "stream",
		hostType: "stream",
		field: "forwarding_host",
		row: {
			incoming_port: 9000,
			forwarding_host: "good",
			forwarding_port: 80,
			tcp_forwarding: 1,
			udp_forwarding: 0,
		},
	},
];

let nextId = 1;
const insertHost = async (type, enabled) => {
	const id = nextId++;
	await db(type.table).insert({ id, owner_user_id: 1, certificate_id: 0, enabled, meta: "{}", ...ts, ...type.row });
	return id;
};
const dbEnabled = async (type, id) => !!(await db(type.table).where("id", id).first()).enabled;
const settle = (p) =>
	p.then(
		() => "ok",
		(err) => err.message,
	);

for (const type of types) {
	describe(`${type.name} enable / disable under the nginx lock`, () => {
		let internal;
		let restoreModel;
		before(async () => {
			internal = await load(type.module);
			restoreModel = slowEnablePatch(await load(type.model));
		});
		after(() => restoreModel());

		// The dead host stand-in rejects on the advanced config instead
		const isBad = (host) => (type.field === "advanced_config" ? host.advanced_config === "bad" : false);
		beforeEach(() => {
			if (type.field !== "advanced_config") {
				return;
			}
			const configure = internalNginx.configure;
			internalNginx.configure = (model, hostType, host, opts) =>
				isBad(host)
					? internalNginx.withLock(async () => {
							await tick(20);
							throw rejected();
						})
					: configure(model, hostType, host, opts);
		});

		for (const delay of [0, 2, 5, 15]) {
			it(`DB and nginx agree when an enable races a rejected update (update ${delay}ms later)`, async () => {
				const id = await insertHost(type, 0);
				const enable = settle(internal.enable(access, { id }));
				await tick(delay);
				const update = settle(internal.update(access, { id, enabled: true, [type.field]: "bad" }));
				const results = await Promise.all([enable, update]);

				assert.notEqual(results[1], "ok", "the bad update is rejected");
				const enabled = await dbEnabled(type, id);
				const isServed = !!served.get(`${type.hostType}#${id}`);
				assert.equal(enabled, isServed, `DB enabled=${enabled}, nginx serves=${isServed} (${results})`);
				assert.equal(enabled, results[0] === "ok");
			});

			it(`DB and nginx agree when a disable races a rejected update (update ${delay}ms later)`, async () => {
				const id = await insertHost(type, 1);
				served.set(`${type.hostType}#${id}`, "good");
				const disable = settle(internal.disable(access, { id }));
				await tick(delay);
				const update = settle(internal.update(access, { id, enabled: true, [type.field]: "bad" }));
				const results = await Promise.all([disable, update]);

				const enabled = await dbEnabled(type, id);
				const isServed = !!served.get(`${type.hostType}#${id}`);
				assert.equal(enabled, isServed, `DB enabled=${enabled}, nginx serves=${isServed} (${results})`);
			});
		}

		it("doesn't undo a disable that commits while an update waits for the lock", async () => {
			const id = await insertHost(type, 1);
			served.set(`${type.hostType}#${id}`, "good");
			const disable = settle(internal.disable(access, { id }));
			// reads the (still enabled) row before the disable is done, patches after it
			const update = settle(
				internal.update(access, { id, [type.field]: type.field === "advanced_config" ? "# x" : "good2" }),
			);
			const results = await Promise.all([disable, update]);
			assert.deepEqual(results, ["ok", "ok"]);
			assert.equal(await dbEnabled(type, id), false);
			assert.equal(served.get(`${type.hostType}#${id}`), null);
		});

		it("lets only one of two concurrent enables through", async () => {
			const id = await insertHost(type, 0);
			const results = await Promise.all([
				settle(internal.enable(access, { id })),
				settle(internal.enable(access, { id })),
			]);
			const already = `${type.name === "stream" ? "Stream" : "Host"} is already enabled`;
			assert.deepEqual(results.sort(), [already, "ok"].sort());
			assert.equal(await dbEnabled(type, id), true);
		});

		it("keeps the host disabled when nginx rejects it, enabled when only the reload failed", async () => {
			const id = await insertHost(type, 0);
			await db(type.table)
				.where("id", id)
				.update({ [type.field]: "bad" });
			await assert.rejects(internal.enable(access, { id }), errs.NginxConfigError);
			assert.equal(await dbEnabled(type, id), false);

			const other = await insertHost(type, 0);
			internalNginx.configure = () =>
				internalNginx.withLock(async () => {
					throw new Error("reload failed");
				});
			await assert.rejects(internal.enable(access, { id: other }), /reload failed/);
			assert.equal(await dbEnabled(type, other), true);
		});
	});
}
