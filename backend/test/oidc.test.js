import { test, mock } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import knex from "knex";
import express from "express";
import { generateKeyPair, exportJWK, SignJWT } from "jose";

const keys = crypto.generateKeyPairSync("rsa", {
	modulusLength: 2048,
	privateKeyEncoding: { type: "pkcs8", format: "pem" },
	publicKeyEncoding: { type: "spki", format: "pem" },
});
const database = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
mock.module("../db.js", { defaultExport: () => database });
mock.module("../lib/config.js", {
	namedExports: {
		isCI: () => true,
		isDebugMode: () => false,
		isSqlite: () => true,
		isMysql: () => false,
		isPostgres: () => false,
		configHas: () => true,
		configGet: () => ({}),
		getPrivateKey: () => keys.privateKey,
		getPublicKey: () => keys.publicKey,
		useLetsencryptStaging: () => false,
		useLetsencryptServer: () => null,
	},
});
const { default: router } = await import("../routes/oidc.js");
const { default: jwtMiddleware } = await import("../lib/express/jwt.js");
const { default: Token } = await import("../models/token.js");
const service = await import("../internal/oidc.js");
const { default: Auth } = await import("../models/auth.js");
const { default: User } = await import("../models/user.js");
const { up, down } = await import("../migrations/20260918000000_oidc.js");
const { validateConfig, seal, unseal, OneTimeStore, clientAuthentication } = await import("../lib/oidc.js");

test("OIDC integration with standard-only signed tokens and existing NPM accounts", async (t) => {
	await database.schema.createTable("user", (table) => {
		table.increments("id");
		table.string("email");
		table.string("name");
		table.string("nickname");
		table.text("roles");
		table.integer("is_deleted").defaultTo(0);
		table.integer("is_disabled").defaultTo(0);
		table.dateTime("created_on");
		table.dateTime("modified_on");
	});
	await database.schema.createTable("auth", (table) => {
		table.increments("id");
		table.integer("user_id");
		table.string("type");
		table.text("secret");
		table.text("meta");
		table.integer("is_deleted").defaultTo(0);
		table.dateTime("created_on");
		table.dateTime("modified_on");
	});
	await database.schema.createTable("user_permission", (table) => {
		table.increments("id");
		table.integer("user_id");
		table.string("visibility");
		table.string("proxy_hosts");
	});
	await up(database);
	await User.query().insert({ id: 1, email: "admin@example.com", name: "Admin", roles: ["admin"] });
	await User.query().insert({ id: 2, email: "user@example.com", name: "User", roles: [] });
	await database("user_permission").insert([
		{ user_id: 1, visibility: "all", proxy_hosts: "manage" },
		{ user_id: 2, visibility: "user", proxy_hosts: "view" },
	]);
	await Auth.query().insert({ user_id: 1, type: "password", secret: "current-password", meta: {} });
	await Auth.query().insert({ user_id: 2, type: "password", secret: "current-password", meta: {} });
	const admin = (await Token().create({ attrs: { id: 1 }, scope: ["user"], expiresIn: "1h" })).token;
	const regular = (await Token().create({ attrs: { id: 2 }, scope: ["user"], expiresIn: "1h" })).token;
	const challenge = (await Token().create({ attrs: { id: 1 }, scope: ["2fa-challenge"], expiresIn: "5m" })).token;
	const app = express();
	app.use(express.json());
	app.use(jwtMiddleware());
	app.use("/api/oidc", router);
	app.use((e, _req, res, _next) => res.status(e.status || 500).json({ error: e.message }));
	const server = await new Promise((resolve) => {
		const s = app.listen(0, "127.0.0.1", () => resolve(s));
	});
	const base = `http://127.0.0.1:${server.address().port}`;
	const origin = "https://npm.example";
	const signing = await generateKeyPair("RS256");
	const wrongSigning = await generateKeyPair("RS256");
	const jwk = await exportJWK(signing.publicKey);
	jwk.kid = "provider-key";
	let nonce = "";
	let pkce = "";
	let variant = "";
	let subject = "subject-1";
	let discoveryCount = 0;
	const nativeFetch = globalThis.fetch;
	globalThis.fetch = async (input, options = {}) => {
		const url = String(input);
		if (!url.startsWith("https://id.example")) return nativeFetch(input, options);
		if (url.includes(".well-known")) {
			discoveryCount++;
			return Response.json({
				issuer: "https://id.example",
				authorization_endpoint: "https://id.example/authorize",
				token_endpoint: "https://id.example/token",
				jwks_uri: "https://id.example/keys",
				token_endpoint_auth_methods_supported: ["client_secret_basic"],
				id_token_signing_alg_values_supported: ["RS256"],
			});
		}
		if (url.endsWith("/keys")) return Response.json({ keys: [jwk] });
		if (url.endsWith("/token")) {
			const body = new URLSearchParams(options.body);
			const headers = new Headers(options.headers);
			assert.ok(headers.get("authorization")?.startsWith("Basic "));
			assert.equal(crypto.createHash("sha256").update(body.get("code_verifier")).digest("base64url"), pkce);
			const jwt = await new SignJWT({ nonce: variant === "nonce" ? "wrong" : nonce })
				.setProtectedHeader({ alg: "RS256", kid: "provider-key" })
				.setIssuer(variant === "issuer" ? "https://wrong.example" : "https://id.example")
				.setSubject(subject)
				.setAudience(variant === "audience" ? "wrong-client" : "test-client")
				.setIssuedAt()
				.setExpirationTime(variant === "expired" ? "-1h" : "1h")
				.sign(variant === "signature" ? wrongSigning.privateKey : signing.privateKey);
			return Response.json({ access_token: "not-retained", token_type: "Bearer", id_token: jwt });
		}
		throw new Error("Unexpected endpoint");
	};
	t.after(async () => {
		globalThis.fetch = nativeFetch;
		await new Promise((resolve) => server.close(resolve));
		await database.destroy();
	});
	async function req(path, { token, body, cookie, method = body ? "POST" : "GET", requestOrigin = origin } = {}) {
		const headers = {
			"Content-Type": "application/json",
			Origin: requestOrigin,
			"Sec-Fetch-Site": "same-origin",
			...(token ? { Authorization: `Bearer ${token}` } : {}),
			...(cookie ? { Cookie: cookie } : {}),
		};
		return nativeFetch(`${base}/api/oidc/${path}`, {
			method,
			headers,
			body: body ? JSON.stringify(body) : undefined,
			redirect: "manual",
		});
	}
	let config = {
		enabled: true,
		auto_login: true,
		issuer: "https://id.example",
		public_url: origin,
		client_id: "test-client",
		client_secret: "test-secret",
		scopes: "openid",
		revision: "initial",
	};
	await t.test("admin-only settings, encrypted secret and optimistic concurrency", async () => {
		assert.notEqual((await req("settings", { token: regular })).status, 200);
		let r = await req("settings", { token: admin, method: "PUT", body: config });
		assert.equal(r.status, 200);
		const v = await r.json();
		assert.equal(v.client_secret, undefined);
		assert.equal(v.client_secret_configured, true);
		config = { ...config, revision: v.revision };
		assert.ok(!(await database("oidc_config").first()).config.includes("test-secret"));
		r = await req("settings", { token: admin, method: "PUT", body: { ...config, revision: "stale" } });
		assert.equal(r.status, 400);
		r = await req("settings", {
			token: admin,
			method: "PUT",
			body: { ...config, enabled: false, public_url: "invalid" },
		});
		assert.equal(r.status, 400);
		assert.equal((await service.readConfig()).config.public_url, origin);
	});
	async function start(token) {
		const r = await req(token ? "link" : "start", { token, body: token ? { password: "current-password" } : {} });
		assert.equal(r.status, 200);
		const url = new URL((await r.json()).url);
		nonce = url.searchParams.get("nonce");
		pkce = url.searchParams.get("code_challenge");
		assert.equal(url.searchParams.get("code_challenge_method"), "S256");
		return { state: url.searchParams.get("state"), cookie: r.headers.getSetCookie()[0].split(";")[0] };
	}
	const callback = (tx) => req(`callback?code=code&state=${tx.state}`, { cookie: tx.cookie });
	await t.test("unknown identity rejected, linking preserves user and roles", async () => {
		let tx = await start();
		assert.equal((await callback(tx)).status, 401);
		tx = await start(admin);
		const r = await callback(tx);
		assert.equal(r.status, 303);
		assert.equal(r.headers.get("Location"), `${origin}/?oidc=linked`);
		assert.equal((await database("user").where({ id: 1 }).first()).roles, '["admin"]');
		assert.equal(
			await database("user")
				.count("id as count")
				.first()
				.then((v) => v.count),
			2,
		);
		assert.equal((await callback(tx)).status, 401);
	});
	await t.test("signed standard-only ID token to one-time NPM token handoff", async () => {
		const tx = await start();
		const r = await callback(tx);
		assert.equal(r.status, 303);
		assert.equal(r.headers.get("Location"), `${origin}/?oidc=complete`);
		const header = r.headers.getSetCookie().find((s) => s.startsWith("__Host-npm_oidc_handoff="));
		assert.ok(header.includes("Secure") && header.includes("HttpOnly") && header.includes("SameSite=Lax"));
		const cookie = header.split(";")[0];
		const denied = await req("exchange", { body: {}, cookie, requestOrigin: "https://evil.example" });
		assert.equal(denied.status, 403);
		assert.equal(denied.headers.get("Access-Control-Allow-Origin"), null);
		const ok = await req("exchange", { body: {}, cookie });
		assert.equal(ok.status, 200);
		const v = await ok.json();
		const token = await Token().load(v.token);
		assert.equal(token.attrs.id, 1);
		assert.deepEqual(token.scope, ["user"]);
		assert.equal((await req("exchange", { body: {}, cookie })).status, 401);
	});
	for (const invalid of ["state", "nonce", "issuer", "audience", "signature", "expired"]) {
		await t.test(`reject invalid ${invalid}`, async () => {
			variant = invalid;
			const tx = await start();
			if (invalid === "state") tx.state = "wrong";
			assert.equal((await callback(tx)).status, 401);
			variant = "";
		});
	}
	await t.test("reject cross-browser state and challenge-token linking", async () => {
		const tx = await start();
		assert.equal((await callback({ ...tx, cookie: "" })).status, 401);
		assert.notEqual((await req("identity", { token: challenge })).status, 200);
		assert.equal((await req("start", { body: {}, requestOrigin: "https://evil.example" })).status, 403);
	});
	await t.test("disabled users and unlinked handoffs fail closed", async () => {
		const tx = await start();
		const r = await callback(tx);
		const cookie = r.headers
			.getSetCookie()
			.find((s) => s.startsWith("__Host-npm_oidc_handoff="))
			.split(";")[0];
		await database("user").where({ id: 1 }).update({ is_disabled: 1 });
		assert.notEqual((await req("exchange", { cookie, body: {} })).status, 200);
		await database("user").where({ id: 1 }).update({ is_disabled: 0 });
	});
	await t.test("pending linking invalidated by password reset", async () => {
		subject = "subject-2";
		const tx = await start(regular);
		await Auth.query().where({ user_id: 2, type: "password" }).patch({ secret: "new-password" });
		assert.equal((await callback(tx)).status, 401);
		assert.equal(await database("oidc_identity").where({ user_id: 2 }).first(), undefined);
		subject = "subject-1";
	});
	await t.test("password reset during password verification cannot mint a fresh link stamp", async () => {
		const original = Auth.prototype.verifyPassword;
		let began;
		let release;
		const started = new Promise((r) => {
			began = r;
		});
		const barrier = new Promise((r) => {
			release = r;
		});
		Auth.prototype.verifyPassword = async () => {
			began();
			await barrier;
			return true;
		};
		try {
			const result = service.reauthenticate(2, "new-password").then(
				() => false,
				() => true,
			);
			await started;
			await Auth.query().where({ user_id: 2, type: "password" }).patch({ secret: "reset-during-verification" });
			release();
			assert.equal(await result, true);
		} finally {
			Auth.prototype.verifyPassword = original;
		}
	});
	await t.test("NPM two-factor remains required after OIDC", async () => {
		const auth = await Auth.query().where({ user_id: 1, type: "password" }).first();
		await Auth.query()
			.where({ id: auth.id })
			.patch({ meta: { totp_enabled: true } });
		const result = await service.loginResult(await service.activeUser(1));
		assert.equal(result.requires_2fa, true);
		assert.equal(result.token, undefined);
	});
	assert.ok(discoveryCount < 4);
	await down(database);
	assert.equal(await database.schema.hasTable("oidc_identity"), false);
});

test("configuration, encryption and one-time store", () => {
	assert.throws(() => validateConfig({ enabled: false, auto_login: false, issuer: "", public_url: "bad" }));
	const value = seal("secret", keys.privateKey);
	assert.equal(unseal(value, keys.privateKey), "secret");
	assert.throws(() => unseal(value, keys.publicKey));
	const store = new OneTimeStore();
	const key = store.put({ ok: true });
	assert.deepEqual(store.take(key), { ok: true });
	assert.equal(store.take(key), undefined);
	for (const method of ["client_secret_basic", "client_secret_post"]) {
		const body = new URLSearchParams();
		const headers = new Headers();
		clientAuthentication("secret", method)(
			{ token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"] },
			{ client_id: "client" },
			body,
			headers,
		);
		if (method === "client_secret_basic") assert.ok(headers.get("authorization")?.startsWith("Basic "));
		else {
			assert.equal(headers.get("authorization"), null);
			assert.equal(body.get("client_secret"), "secret");
		}
	}
});
