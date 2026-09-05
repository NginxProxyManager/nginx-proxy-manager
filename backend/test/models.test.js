import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const testRoot = await mkdtemp(path.join(os.tmpdir(), "npm-model-test-"));
process.env.NPM_KEYS_FILE = path.join(testRoot, "keys.json");
process.env.DB_SQLITE_FILE = path.join(testRoot, "database.sqlite");
const [
	{ default: AccessList },
	{ default: AccessListAuth },
	{ default: AccessListClient },
	{ default: AuditLog },
	{ default: Auth },
	{ default: Certificate },
	{ default: DeadHost },
	{ default: NginxDeployment },
	{ default: ProxyHost },
	{ default: ProxyHostMonitorConfig },
	{ default: ProxyHostMonitorState },
	{ default: ProxyHostUpstream },
	{ default: RedirectionHost },
	{ default: Setting },
	{ default: Stream },
	{ default: tokenFactory },
	{ default: Upstream },
	{ default: UpstreamServer },
	{ default: User },
	{ default: UserPermission },
] = await Promise.all([
	import("../models/access_list.js"),
	import("../models/access_list_auth.js"),
	import("../models/access_list_client.js"),
	import("../models/audit-log.js"),
	import("../models/auth.js"),
	import("../models/certificate.js"),
	import("../models/dead_host.js"),
	import("../models/nginx_deployment.js"),
	import("../models/proxy_host.js"),
	import("../models/proxy_host_monitor_config.js"),
	import("../models/proxy_host_monitor_state.js"),
	import("../models/proxy_host_upstream.js"),
	import("../models/redirection_host.js"),
	import("../models/setting.js"),
	import("../models/stream.js"),
	import("../models/token.js"),
	import("../models/upstream.js"),
	import("../models/upstream_server.js"),
	import("../models/user.js"),
	import("../models/user_permission.js"),
]);

const modelClasses = [
	AccessList,
	AccessListAuth,
	AccessListClient,
	AuditLog,
	Auth,
	Certificate,
	DeadHost,
	NginxDeployment,
	ProxyHost,
	ProxyHostMonitorConfig,
	ProxyHostMonitorState,
	ProxyHostUpstream,
	RedirectionHost,
	Setting,
	Stream,
	Upstream,
	UpstreamServer,
	User,
	UserPermission,
];

const queryRecorder = () => {
	const calls = [];
	const query = new Proxy(
		{},
		{
			get: (_, property) => (...args) => {
				calls.push([property, ...args]);
				return query;
			},
		},
	);
	return { calls, query };
};

test("model metadata and relation filters are executable", () => {
	for (const ModelClass of modelClasses) {
		assert.equal(typeof ModelClass.tableName, "string", ModelClass.name);
		if (Object.getOwnPropertyDescriptor(ModelClass, "name")?.get) assert.equal(typeof ModelClass.name, "string");
		for (const property of ["jsonAttributes", "defaultAllowGraph", "defaultExpand", "defaultOrder", "idColumn"]) {
			if (Object.getOwnPropertyDescriptor(ModelClass, property)?.get) assert.ok(ModelClass[property]);
		}
		if (Object.getOwnPropertyDescriptor(ModelClass, "relationMappings")?.get) {
			for (const relation of Object.values(ModelClass.relationMappings)) {
				assert.ok(relation.modelClass);
				assert.ok(relation.join);
				if (typeof relation.modify === "function") {
					const { query, calls } = queryRecorder();
					relation.modify(query);
					assert.ok(calls.length);
				}
			}
		}
	}
});

test("model insert/update hooks establish timestamps and defaults", async () => {
	for (const ModelClass of modelClasses) {
		const model = new ModelClass();
		if (typeof model.$beforeInsert === "function") await model.$beforeInsert({});
		if (typeof model.$beforeUpdate === "function") await model.$beforeUpdate({});
	}

	const certificate = new Certificate();
	certificate.domain_names = ["z.example", null, "a.example"];
	certificate.$beforeInsert();
	assert.deepEqual(certificate.domain_names, ["a.example", "z.example"]);
	assert.deepEqual(certificate.meta, {});

	const proxy = new ProxyHost();
	proxy.domain_names = ["z.example", "a.example"];
	proxy.$beforeInsert();
	assert.deepEqual(proxy.domain_names, ["a.example", "z.example"]);
	assert.equal(proxy.nginx_config_schema_version, 2);
	assert.equal(proxy.nginx_config_revision, 1);

	const upstream = new Upstream();
	upstream.$beforeInsert();
	assert.equal(upstream.load_balancing_method, "round_robin");
	assert.equal(upstream.zone_size, "64k");
	const server = new UpstreamServer();
	server.$beforeInsert();
	assert.deepEqual([server.weight, server.max_fails, server.fail_timeout, server.sort_order], [1, 1, "10s", 0]);
});

test("database JSON conversion covers boolean and structured fields", () => {
	for (const ModelClass of [AccessList, Auth, Certificate, DeadHost, ProxyHostMonitorConfig, RedirectionHost, Stream, Upstream, UpstreamServer, User]) {
		const model = new ModelClass();
		const parsed = model.$parseDatabaseJson({ is_deleted: 1, enabled: 0, backup: 1, down: 0 });
		const formatted = model.$formatDatabaseJson({ is_deleted: true, enabled: false, backup: true, down: false });
		assert.equal(typeof parsed, "object");
		assert.equal(typeof formatted, "object");
	}
	const proxy = new ProxyHost();
	const parsed = proxy.$parseDatabaseJson({ nginx_config: null, is_deleted: 0 });
	assert.equal(parsed.nginx_config.schema_version, 2);
});

test("token model handles local state and rejects missing tokens", async () => {
	const token = tokenFactory();
	assert.equal(token.hasScope("user"), false);
	assert.equal(token.get("missing"), null);
	token.set("scope", ["user"]);
	token.set("attrs", { id: 17 });
	assert.equal(token.hasScope("user"), true);
	assert.equal(token.getUserId(), 17);
	token.set("attrs", {});
	assert.equal(token.getUserId(9), 9);
	assert.equal(token.getUserId(), 0);
	await assert.rejects(() => token.load(null), /Empty token/);
	await assert.rejects(() => token.load("null"), /Empty token/);
});
