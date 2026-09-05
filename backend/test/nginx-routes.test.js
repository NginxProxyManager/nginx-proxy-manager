import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";

const testRoot = await mkdtemp(path.join(os.tmpdir(), "npm-nginx-route-test-"));
process.env.NPM_KEYS_FILE = path.join(testRoot, "keys.json");
process.env.DB_SQLITE_FILE = path.join(testRoot, "database.sqlite");

const [
	{ default: tokenFactory },
	{ default: accessListRoutes },
	{ default: upstreamRoutes },
	{ default: monitoringRoutes },
	{ default: accessList },
	{ default: upstream },
	{ default: proxyHost },
	{ default: monitor },
	{ default: userModel },
	{ default: proxyHostModel },
	{ default: deadHostRoutes },
	{ default: redirectionHostRoutes },
	{ default: streamRoutes },
	{ default: proxyHostRoutes },
	{ default: deadHost },
	{ default: redirectionHost },
	{ default: stream },
	{ default: certificateRoutes },
	{ default: certificate },
	{ getCompiledSchema },
] = await Promise.all([
	import("../models/token.js"),
	import("../routes/nginx/access_lists.js"),
	import("../routes/nginx/upstreams.js"),
	import("../routes/nginx/proxy_host_monitoring.js"),
	import("../internal/access-list.js"),
	import("../internal/upstream.js"),
	import("../internal/proxy-host.js"),
	import("../internal/proxy-host-monitor.js"),
	import("../models/user.js"),
	import("../models/proxy_host.js"),
	import("../routes/nginx/dead_hosts.js"),
	import("../routes/nginx/redirection_hosts.js"),
	import("../routes/nginx/streams.js"),
	import("../routes/nginx/proxy_hosts.js"),
	import("../internal/dead-host.js"),
	import("../internal/redirection-host.js"),
	import("../internal/stream.js"),
	import("../routes/nginx/certificates.js"),
	import("../internal/certificate.js"),
	import("../schema/index.js"),
]);

await getCompiledSchema();
const originalUserQuery = userModel.query;
const originalProxyHostQuery = proxyHostModel.query;
userModel.query = () => {
	const chain = {
		where: () => chain,
		andWhere: () => chain,
		allowGraph: () => chain,
		withGraphFetched: () => chain,
		first: async () => ({ id: 1, roles: ["admin"], permissions: { visibility: "all", proxy_hosts: "manage" } }),
	};
	return chain;
};
proxyHostModel.query = () => {
	const chain = {
		select: () => chain,
		andWhere: () => chain,
		then: (resolve, reject) => Promise.resolve([{ id: 7 }]).then(resolve, reject),
	};
	return chain;
};
test.after(() => {
	userModel.query = originalUserQuery;
	proxyHostModel.query = originalProxyHostQuery;
});
const signed = await tokenFactory().create({ attrs: { id: 1 }, scope: ["user", "admin"], expiresIn: "1h" });
const withServer = async (router, run) => {
	const app = express();
	app.use(express.json());
	app.use((_req, res, next) => { res.locals.token = signed.token; next(); });
	app.use(router);
	app.use((error, _req, res, _next) => res.status(error.status || 500).send({ message: error.message }));
	const server = app.listen(0, "127.0.0.1");
	await new Promise((resolve) => server.once("listening", resolve));
	try {
		await run(`http://127.0.0.1:${server.address().port}`);
	} finally {
		await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
	}
};

test("access-list routes validate queries and delegate list, item and delete requests", async () => {
	const originals = { getAll: accessList.getAll, get: accessList.get, delete: accessList.delete };
	const calls = [];
	accessList.getAll = async (_access, expand, query) => { calls.push(["all", expand, query]); return [{ id: 7 }]; };
	accessList.get = async (_access, data) => { calls.push(["get", data]); return { id: data.id }; };
	accessList.delete = async (_access, data) => { calls.push(["delete", data]); return true; };
	try {
		await withServer(accessListRoutes, async (baseUrl) => {
			let response = await fetch(`${baseUrl}/?expand=owner,items&query=office`);
			assert.equal(response.status, 200);
			assert.deepEqual(await response.json(), [{ id: 7 }]);
			response = await fetch(`${baseUrl}/7?expand=clients`);
			assert.deepEqual(await response.json(), { id: 7 });
			response = await fetch(`${baseUrl}/7`, { method: "DELETE" });
			assert.equal(await response.json(), true);
			assert.equal((await fetch(`${baseUrl}/`, { method: "OPTIONS" })).status, 204);
			assert.equal((await fetch(`${baseUrl}/7`, { method: "OPTIONS" })).status, 204);
		});
		assert.deepEqual(calls[0], ["all", ["owner", "items"], "office"]);
		assert.equal(calls[1][1].id, 7);
		assert.equal(calls[2][1].id, 7);
	} finally {
		Object.assign(accessList, originals);
	}
});

test("upstream routes expose list, item, preview, artifacts, publish, references and deletion", async () => {
	const names = ["getAll", "get", "delete", "previewNginxConfig", "getNginxArtifacts", "publish", "getReferences"];
	const originals = Object.fromEntries(names.map((name) => [name, upstream[name]]));
	const calls = [];
	upstream.getAll = async (_access, expand, query) => { calls.push(["all", expand, query]); return [{ id: 4 }]; };
	upstream.get = async (_access, data) => ({ id: data.id, name: "api" });
	upstream.delete = async (_access, data) => ({ deleted: data.id });
	upstream.previewNginxConfig = async (_access, data) => ({ valid: true, received: data.name });
	upstream.getNginxArtifacts = async (_access, id, include) => ({ id, include });
	upstream.publish = async (_access, id) => ({ published: id });
	upstream.getReferences = async (_access, id) => [{ upstreamId: id }];
	try {
		await withServer(upstreamRoutes, async (baseUrl) => {
			let response = await fetch(`${baseUrl}/?expand=servers&query=api`);
			assert.deepEqual(await response.json(), [{ id: 4 }]);
			response = await fetch(`${baseUrl}/4?expand=servers`);
			assert.equal((await response.json()).name, "api");
			response = await fetch(`${baseUrl}/nginx-config/preview`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "candidate" }) });
			assert.deepEqual(await response.json(), { valid: true, received: "candidate" });
			response = await fetch(`${baseUrl}/4/nginx-config?include_content=active,desired`);
			assert.deepEqual((await response.json()).include, ["active", "desired"]);
			assert.deepEqual(await (await fetch(`${baseUrl}/4/publish`, { method: "POST" })).json(), { published: 4 });
			assert.deepEqual(await (await fetch(`${baseUrl}/4/references`)).json(), [{ upstreamId: 4 }]);
			assert.deepEqual(await (await fetch(`${baseUrl}/4`, { method: "DELETE" })).json(), { deleted: 4 });
			for (const endpoint of ["/", "/nginx-config/preview", "/4/nginx-config", "/4/publish", "/4/references", "/4"]) {
				assert.equal((await fetch(`${baseUrl}${endpoint}`, { method: "OPTIONS" })).status, 204);
			}
		});
		assert.deepEqual(calls[0], ["all", ["servers"], "api"]);
	} finally {
		Object.assign(upstream, originals);
	}
});

test("proxy-host monitoring routes validate ids and delegate snapshots, settings, series and probes", async () => {
	const originals = {
		get: proxyHost.get,
		snapshot: monitor.snapshot,
		updateConfig: monitor.updateConfig,
		timeseries: monitor.timeseries,
		probe: monitor.probe,
	};
	proxyHost.get = async (_access, data) => ({ id: data.id });
	monitor.snapshot = async (id, range) => ({ id, range });
	monitor.updateConfig = async (id, body) => ({ id, ...body });
	monitor.timeseries = async (id, range) => [{ id, ...range }];
	monitor.probe = async (id) => ({ id, status: "online" });
	try {
		await withServer(monitoringRoutes, async (baseUrl) => {
			let response = await fetch(`${baseUrl}/7/monitoring?from=a&to=b`);
			assert.equal((await response.json()).id, 7);
			response = await fetch(`${baseUrl}/7/monitoring`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: true }) });
			assert.deepEqual(await response.json(), { id: 7, enabled: true });
			response = await fetch(`${baseUrl}/7/monitoring/timeseries?resolution=hour&from=a&to=b`);
			assert.equal((await response.json())[0].resolution, "hour");
			response = await fetch(`${baseUrl}/7/monitoring/probe`, { method: "POST" });
			assert.deepEqual(await response.json(), { id: 7, status: "online" });
			response = await fetch(`${baseUrl}/0/monitoring`);
			assert.equal(response.status, 400);
			for (const endpoint of ["/7/monitoring", "/7/monitoring/timeseries", "/7/monitoring/probe"]) {
				assert.equal((await fetch(`${baseUrl}${endpoint}`, { method: "OPTIONS" })).status, 204);
			}
		});
	} finally {
		Object.assign(proxyHost, { get: originals.get });
		Object.assign(monitor, originals);
	}
});

for (const family of [
	{ name: "dead host", router: deadHostRoutes, service: deadHost },
	{ name: "redirection host", router: redirectionHostRoutes, service: redirectionHost },
	{ name: "stream", router: streamRoutes, service: stream },
	{ name: "proxy host", router: proxyHostRoutes, service: proxyHost },
]) {
	test(`${family.name} routes delegate list, item, delete, enable and disable operations`, async () => {
		const methodNames = ["getAll", "get", "delete", "enable", "disable"];
		const originals = Object.fromEntries(methodNames.map((name) => [name, family.service[name]]));
		family.service.getAll = async (_access, expand, query) => [{ id: 7, expand, query }];
		family.service.get = async (_access, data) => ({ id: data.id, expand: data.expand });
		family.service.delete = async (_access, data) => ({ deleted: data.id });
		family.service.enable = async (_access, data) => ({ enabled: data.id });
		family.service.disable = async (_access, data) => ({ disabled: data.id });
		try {
			await withServer(family.router, async (baseUrl) => {
				let response = await fetch(`${baseUrl}/?expand=owner&query=example`);
				assert.equal((await response.json())[0].id, 7);
				response = await fetch(`${baseUrl}/7?expand=certificate`);
				assert.equal((await response.json()).id, 7);
				assert.deepEqual(await (await fetch(`${baseUrl}/7`, { method: "DELETE" })).json(), { deleted: 7 });
				assert.deepEqual(await (await fetch(`${baseUrl}/7/enable`, { method: "POST" })).json(), { enabled: 7 });
				assert.deepEqual(await (await fetch(`${baseUrl}/7/disable`, { method: "POST" })).json(), { disabled: 7 });
				for (const endpoint of ["/", "/7", "/7/enable", "/7/disable"]) {
					assert.equal((await fetch(`${baseUrl}${endpoint}`, { method: "OPTIONS" })).status, 204);
				}
			});
		} finally {
			Object.assign(family.service, originals);
		}
	});
}

test("certificate routes expose providers and delegate list, item, challenge, delete and renew", async () => {
	const methodNames = ["getAll", "get", "testHttpsChallenge", "delete", "renew"];
	const originals = Object.fromEntries(methodNames.map((name) => [name, certificate[name]]));
	certificate.getAll = async (_access, expand, query) => [{ id: 5, expand, query }];
	certificate.get = async (_access, data) => ({ id: data.id });
	certificate.testHttpsChallenge = async (_access, data) => Object.fromEntries(data.domains.map((domain) => [domain, "ok"]));
	certificate.delete = async (_access, data) => ({ deleted: data.id });
	certificate.renew = async (_access, data) => ({ renewed: data.id });
	try {
		await withServer(certificateRoutes, async (baseUrl) => {
			let response = await fetch(`${baseUrl}/?expand=owner&query=example`);
			assert.equal((await response.json())[0].id, 5);
			response = await fetch(`${baseUrl}/5?expand=owner`);
			assert.deepEqual(await response.json(), { id: 5 });
			response = await fetch(`${baseUrl}/dns-providers`);
			const providers = await response.json();
			assert.ok(providers.length > 5);
			assert.ok(providers.every((provider) => provider.id && provider.name && provider.credentials));
			response = await fetch(`${baseUrl}/test-http`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domains: ["example.test"] }) });
			assert.deepEqual(await response.json(), { "example.test": "ok" });
			assert.deepEqual(await (await fetch(`${baseUrl}/5`, { method: "DELETE" })).json(), { deleted: 5 });
			assert.deepEqual(await (await fetch(`${baseUrl}/5/renew`, { method: "POST" })).json(), { renewed: 5 });
			assert.deepEqual(await (await fetch(`${baseUrl}/validate`, { method: "POST" })).json(), { error: "No files were uploaded" });
			assert.deepEqual(await (await fetch(`${baseUrl}/5/upload`, { method: "POST" })).json(), { error: "No files were uploaded" });
			for (const endpoint of ["/", "/dns-providers", "/test-http", "/validate", "/5", "/5/upload", "/5/renew", "/5/download"]) {
				assert.equal((await fetch(`${baseUrl}${endpoint}`, { method: "OPTIONS" })).status, 204);
			}
		});
	} finally {
		Object.assign(certificate, originals);
	}
});
