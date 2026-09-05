import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";

const testRoot = await mkdtemp(path.join(os.tmpdir(), "npm-route-test-"));
process.env.NPM_KEYS_FILE = path.join(testRoot, "keys.json");
process.env.DB_SQLITE_FILE = path.join(testRoot, "database.sqlite");

const [
	{ default: tokenFactory },
	{ default: reportRoutes },
	{ default: settingsRoutes },
	{ default: tokenRoutes },
	{ default: internalReport },
	{ default: internalSetting },
	{ default: internalToken },
	{ getCompiledSchema },
	{ default: userRoutes },
	{ default: internalUser },
	{ default: internal2FA },
	{ default: auditRoutes },
	{ default: internalAudit },
] = await Promise.all([
	import("../models/token.js"),
	import("../routes/reports.js"),
	import("../routes/settings.js"),
	import("../routes/tokens.js"),
	import("../internal/report.js"),
	import("../internal/setting.js"),
	import("../internal/token.js"),
	import("../schema/index.js"),
	import("../routes/users.js"),
	import("../internal/user.js"),
	import("../internal/2fa.js"),
	import("../routes/audit-log.js"),
	import("../internal/audit-log.js"),
]);

await getCompiledSchema();
const signed = await tokenFactory().create({ attrs: {}, scope: ["internal"], expiresIn: "1h" });

const withServer = async (router, run, authenticated = true) => {
	const app = express();
	app.use(express.json());
	if (authenticated) app.use((_req, res, next) => { res.locals.token = signed.token; next(); });
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

test("reports route authenticates, returns host counts and supports preflight", async () => {
	const original = internalReport.getHostsReport;
	internalReport.getHostsReport = async () => ({ proxy: 2, redirection: 1, dead: 0, stream: 3 });
	try {
		await withServer(reportRoutes, async (baseUrl) => {
			let response = await fetch(`${baseUrl}/hosts`);
			assert.equal(response.status, 200);
			assert.deepEqual(await response.json(), { proxy: 2, redirection: 1, dead: 0, stream: 3 });
			response = await fetch(`${baseUrl}/hosts`, { method: "OPTIONS" });
			assert.equal(response.status, 204);
		});
	} finally {
		internalReport.getHostsReport = original;
	}
});

test("settings routes list, retrieve, update, validate and forward service errors", async () => {
	const originals = { getAll: internalSetting.getAll, get: internalSetting.get, update: internalSetting.update };
	internalSetting.getAll = async () => [{ id: "default-site", value: "congratulations" }];
	internalSetting.get = async (_access, data) => ({ id: data.id, value: "congratulations" });
	internalSetting.update = async (_access, data) => ({ ...data, updated: true });
	try {
		await withServer(settingsRoutes, async (baseUrl) => {
			let response = await fetch(`${baseUrl}/`);
			assert.equal(response.status, 200);
			assert.equal((await response.json())[0].id, "default-site");

			response = await fetch(`${baseUrl}/default-site`);
			assert.deepEqual(await response.json(), { id: "default-site", value: "congratulations" });

			response = await fetch(`${baseUrl}/default-site`, {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ value: "404" }),
			});
			assert.equal(response.status, 200);
			assert.equal((await response.json()).updated, true);
			assert.equal((await fetch(`${baseUrl}/`, { method: "OPTIONS" })).status, 204);
			assert.equal((await fetch(`${baseUrl}/default-site`, { method: "OPTIONS" })).status, 204);

			internalSetting.get = async () => { throw new Error("setting unavailable"); };
			response = await fetch(`${baseUrl}/broken`);
			assert.equal(response.status, 500);
			assert.deepEqual(await response.json(), { message: "setting unavailable" });
		});
	} finally {
		Object.assign(internalSetting, originals);
	}
});

test("token routes issue email and 2FA tokens and refresh authenticated tokens", async () => {
	const originals = {
		getTokenFromEmail: internalToken.getTokenFromEmail,
		verify2FA: internalToken.verify2FA,
		getFreshToken: internalToken.getFreshToken,
	};
	internalToken.getTokenFromEmail = async (data) => ({ token: `email:${data.identity}` });
	internalToken.verify2FA = async (_challenge, code) => ({ token: `2fa:${code}` });
	internalToken.getFreshToken = async (_access, data) => ({ token: "fresh", ...data });
	try {
		await withServer(tokenRoutes, async (baseUrl) => {
			let response = await fetch(`${baseUrl}/?expiry=2h&scope=worker`);
			assert.equal(response.status, 200);
			assert.deepEqual(await response.json(), { token: "fresh", expiry: "2h", scope: "worker" });

			response = await fetch(`${baseUrl}/`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ identity: "owner@example.test", secret: "secret" }),
			});
			assert.equal(response.status, 200);
			assert.deepEqual(await response.json(), { token: "email:owner@example.test" });

			response = await fetch(`${baseUrl}/2fa`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ challenge_token: "challenge", code: "123456" }),
			});
			assert.equal(response.status, 200);
			assert.deepEqual(await response.json(), { token: "2fa:123456" });
			assert.equal((await fetch(`${baseUrl}/`, { method: "OPTIONS" })).status, 204);
			assert.equal((await fetch(`${baseUrl}/2fa`, { method: "OPTIONS" })).status, 204);
		});
	} finally {
		Object.assign(internalToken, originals);
	}
});

test("user routes delegate account, permission, login and complete 2FA lifecycle operations", async () => {
	const userMethods = ["getAll", "get", "getUserOmisionsByAccess", "delete", "loginAs", "setPassword", "setPermissions", "update"];
	const twoFactorMethods = ["startSetup", "getStatus", "disable", "enable", "regenerateBackupCodes"];
	const userOriginals = Object.fromEntries(userMethods.map((name) => [name, internalUser[name]]));
	const twoFactorOriginals = Object.fromEntries(twoFactorMethods.map((name) => [name, internal2FA[name]]));
	internalUser.getAll = async (_access, expand, query) => [{ id: 7, expand, query }];
	internalUser.getUserOmisionsByAccess = () => [];
	internalUser.get = async (_access, data) => ({ id: data.id, expand: data.expand });
	internalUser.update = async (_access, data) => ({ ...data, updated: true });
	internalUser.delete = async (_access, data) => ({ deleted: data.id });
	internalUser.setPassword = async (_access, data) => ({ passwordChanged: data.id });
	internalUser.setPermissions = async (_access, data) => ({ permissionsChanged: data.id });
	internalUser.loginAs = async (_access, data) => ({ token: `user-${data.id}` });
	internal2FA.startSetup = async (_access, id) => ({ secret: `secret-${id}` });
	internal2FA.getStatus = async (_access, id) => ({ enabled: false, id });
	internal2FA.disable = async () => true;
	internal2FA.enable = async (_access, id, code) => ({ backup_codes: [`${id}-${code}`] });
	internal2FA.regenerateBackupCodes = async (_access, id, code) => ({ backup_codes: [`new-${id}-${code}`] });
	try {
		await withServer(userRoutes, async (baseUrl) => {
			let response = await fetch(`${baseUrl}/?expand=permissions&query=alice`);
			assert.equal((await response.json())[0].id, 7);
			response = await fetch(`${baseUrl}/7?expand=permissions`);
			assert.equal((await response.json()).id, 7);
			assert.deepEqual(await (await fetch(`${baseUrl}/7`, { method: "DELETE" })).json(), { deleted: 7 });
			assert.deepEqual(await (await fetch(`${baseUrl}/7/login`, { method: "POST" })).json(), { token: "user-7" });

			assert.deepEqual(await (await fetch(`${baseUrl}/7/2fa`, { method: "POST" })).json(), { secret: "secret-7" });
			assert.deepEqual(await (await fetch(`${baseUrl}/7/2fa`)).json(), { enabled: false, id: 7 });
			assert.equal(await (await fetch(`${baseUrl}/7/2fa?code=123456`, { method: "DELETE" })).json(), true);
			assert.equal((await fetch(`${baseUrl}/7/2fa`, { method: "DELETE" })).status, 400);

			response = await fetch(`${baseUrl}/7/2fa/enable`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: "123456" }) });
			assert.deepEqual(await response.json(), { backup_codes: ["7-123456"] });
			response = await fetch(`${baseUrl}/7/2fa/backup-codes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: "654321" }) });
			assert.deepEqual(await response.json(), { backup_codes: ["new-7-654321"] });

			for (const endpoint of ["/", "/7", "/7/auth", "/7/permissions", "/7/login", "/7/2fa", "/7/2fa/enable", "/7/2fa/backup-codes"]) {
				assert.equal((await fetch(`${baseUrl}${endpoint}`, { method: "OPTIONS" })).status, 204);
			}
		});
	} finally {
		Object.assign(internalUser, userOriginals);
		Object.assign(internal2FA, twoFactorOriginals);
	}
});

test("audit routes delegate filtered list and item retrieval", async () => {
	const originals = { getAll: internalAudit.getAll, get: internalAudit.get };
	internalAudit.getAll = async (_access, expand, query) => [{ id: 8, expand, query }];
	internalAudit.get = async (_access, data) => ({ id: data.id, expand: data.expand });
	try {
		await withServer(auditRoutes, async (baseUrl) => {
			let response = await fetch(`${baseUrl}/?expand=user&query=created`);
			assert.deepEqual(await response.json(), [{ id: 8, expand: ["user"], query: "created" }]);
			response = await fetch(`${baseUrl}/8?expand=user`);
			assert.deepEqual(await response.json(), { id: 8, expand: ["user"] });
			assert.equal((await fetch(`${baseUrl}/`, { method: "OPTIONS" })).status, 204);
			assert.equal((await fetch(`${baseUrl}/8`, { method: "OPTIONS" })).status, 204);
		});
	} finally {
		Object.assign(internalAudit, originals);
	}
});
