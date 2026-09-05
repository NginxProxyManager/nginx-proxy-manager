import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import express from "express";
import ciRoutes from "../routes/ci.js";
import schemaRoutes from "../routes/schema.js";
import versionRoutes from "../routes/version.js";
import remoteVersion from "../internal/remote-version.js";
import { getCompiledSchema, getValidationSchema } from "../schema/index.js";

const withServer = async (router, run) => {
	const app = express();
	app.use(express.json());
	app.use(router);
	app.use((error, _req, res, _next) => res.status(error.status || 500).send({ message: error.message }));
	const server = app.listen(0, "127.0.0.1");
	await new Promise((resolve) => server.once("listening", resolve));
	try {
		const { port } = server.address();
		await run(`http://127.0.0.1:${port}`);
	} finally {
		await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
	}
};

test("version route serves update results, fallbacks, and preflight", async () => {
	const original = remoteVersion.get;
	try {
		await withServer(versionRoutes, async (baseUrl) => {
			remoteVersion.get = async () => ({ current: "1.3.2", latest: "1.4.0", update_available: true });
			let response = await fetch(`${baseUrl}/check`);
			assert.equal(response.status, 200);
			assert.deepEqual(await response.json(), { current: "1.3.2", latest: "1.4.0", update_available: true });

			remoteVersion.get = async () => {
				throw new Error("registry unavailable");
			};
			response = await fetch(`${baseUrl}/check`);
			assert.equal(response.status, 200);
			assert.deepEqual(await response.json(), { current: null, latest: null, update_available: false });

			response = await fetch(`${baseUrl}/check`, { method: "OPTIONS" });
			assert.equal(response.status, 204);
		});
	} finally {
		remoteVersion.get = original;
	}
});

test("schema route compiles, caches, and publishes a request-specific API origin", async () => {
	const first = await getCompiledSchema();
	const second = await getCompiledSchema();
	assert.equal(first, second);
	assert.ok(getValidationSchema("/nginx/proxy-hosts", "post"));
	assert.equal(getValidationSchema("/not-real", "post"), null);

	await withServer(schemaRoutes, async (baseUrl) => {
		let response = await fetch(`${baseUrl}/`, { headers: { origin: "https://manager.example" } });
		assert.equal(response.status, 200);
		let body = await response.json();
		const release = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
		assert.equal(body.info.version, release.version);
		assert.equal(body.servers[0].url, "https://manager.example/api");

		response = await fetch(`${baseUrl}/`, { headers: { "x-forwarded-proto": "https" } });
		body = await response.json();
		assert.equal(body.servers[0].url, "https://127.0.0.1/api");
		assert.equal((await fetch(`${baseUrl}/`, { method: "OPTIONS" })).status, 204);
	});
});

test("CI route lists known plugins and rejects unknown plugin installations", async () => {
	await withServer(ciRoutes, async (baseUrl) => {
		let response = await fetch(`${baseUrl}/certbot-plugins`);
		assert.equal(response.status, 200);
		assert.equal(typeof (await response.json()), "object");

		response = await fetch(`${baseUrl}/certbot-plugins/definitely-not-a-plugin`, { method: "POST" });
		assert.equal(response.status, 404);
		assert.deepEqual(await response.json(), { error: "Plugin not found" });
		assert.equal((await fetch(`${baseUrl}/certbot-plugins`, { method: "OPTIONS" })).status, 204);
		assert.equal((await fetch(`${baseUrl}/certbot-plugins/cloudflare`, { method: "OPTIONS" })).status, 204);
	});
});
