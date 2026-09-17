import express from "express";
import { parse, serialize } from "cookie";
import { client, discover, OneTimeStore, sameOrigin } from "../lib/oidc.js";
import * as service from "../internal/oidc.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import db from "../db.js";

const router = express.Router();
const transactions = new OneTimeStore();
const handoffs = new OneTimeStore(60000);
const txCookie = "__Host-npm_oidc_tx";
const handoffCookie = "__Host-npm_oidc_handoff";
const cookieOptions = { path: "/", httpOnly: true, secure: true, sameSite: "lax" };
const putCookie = (res, name, value, maxAge) =>
	res.append("Set-Cookie", serialize(name, value, { ...cookieOptions, maxAge }));
const clearCookie = (res, name) => putCookie(res, name, "", 0);
const handler = (fn) => async (req, res, _next) => {
	try {
		await fn(req, res);
	} catch {
		res.status(400).json({ error: { message: "OIDC request failed. Check settings or use local login." } });
	}
};
const requireUser = async (res) => {
	const id = res.locals.access.token.getUserId();
	await res.locals.access.can("users:get", id);
	return id;
};

// Do not inherit the API's permissive credentialed CORS for cookie endpoints.
router.use((_req, res, next) => {
	res.removeHeader("Access-Control-Allow-Origin");
	res.removeHeader("Access-Control-Allow-Credentials");
	res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
	next();
});
router.get(
	"/status",
	handler(async (_req, res) => {
		const { config } = await service.readConfig();
		res.json({ enabled: config.enabled, auto_login: config.auto_login });
	}),
);
router.get(
	"/settings",
	jwtdecode(),
	handler(async (_req, res) => {
		await res.locals.access.can("settings:get", "oidc");
		res.json(service.publicConfig(await service.readConfig()));
	}),
);
router.put("/settings", jwtdecode(), async (req, res, next) => {
	try {
		res.json(await service.saveConfig(res.locals.access, req.body));
	} catch (error) {
		next(error);
	}
});
router.get(
	"/identity",
	jwtdecode(),
	handler(async (_req, res) => {
		const id = await requireUser(res);
		await service.activeUser(id);
		const row = await db()("oidc_identity").where({ user_id: id }).first();
		res.json({ linked: !!row, issuer: row?.issuer || "" });
	}),
);
router.post(
	"/unlink",
	jwtdecode(),
	handler(async (req, res) => {
		const { config } = await service.readConfig();
		if (!sameOrigin(req, config)) return res.sendStatus(403);
		const id = await requireUser(res);
		await service.reauthenticate(id, req.body.password, req.body.code);
		await db()("oidc_identity").where({ user_id: id }).delete();
		res.json({ linked: false });
	}),
);
async function start(req, res, userId = null, stamp = null) {
	const { config, revision } = await service.readConfig();
	if (!config.enabled) return res.sendStatus(404);
	if (!sameOrigin(req, config)) return res.sendStatus(403);
	const provider = await discover(config, revision);
	const state = client.randomState();
	const nonce = client.randomNonce();
	const verifier = client.randomPKCECodeVerifier();
	const tx = transactions.put({ state, nonce, verifier, revision, userId, stamp });
	putCookie(res, txCookie, tx, 300);
	const url = client.buildAuthorizationUrl(provider, {
		redirect_uri: new URL("/api/oidc/callback", config.public_url).href,
		scope: config.scopes,
		state,
		nonce,
		code_challenge: await client.calculatePKCECodeChallenge(verifier),
		code_challenge_method: "S256",
	});
	res.json({ url: url.href });
}
router.post(
	"/start",
	handler((req, res) => start(req, res)),
);
router.post(
	"/link",
	jwtdecode(),
	handler(async (req, res) => {
		const { config } = await service.readConfig();
		if (!sameOrigin(req, config)) return res.sendStatus(403);
		const id = await requireUser(res);
		const stamp = await service.reauthenticate(id, req.body.password, req.body.code);
		return start(req, res, id, stamp);
	}),
);
router.get("/callback", async (req, res) => {
	try {
		const tx = transactions.take(parse(req.headers.cookie || "")[txCookie]);
		clearCookie(res, txCookie);
		const { config, revision } = await service.readConfig();
		if (!tx || !config.enabled || tx.revision !== revision) throw new Error("Invalid transaction");
		const provider = await discover(config, revision);
		const url = new URL("/api/oidc/callback", config.public_url);
		url.search = req.originalUrl.split("?")[1] || "";
		const tokens = await client.authorizationCodeGrant(provider, url, {
			pkceCodeVerifier: tx.verifier,
			expectedState: tx.state,
			expectedNonce: tx.nonce,
			idTokenExpected: true,
		});
		const claims = tokens.claims();
		if (!claims?.sub) throw new Error("Missing subject");
		const current = await service.readConfig();
		if (current.revision !== revision || !current.config.enabled) throw new Error("Configuration changed");
		if (tx.userId) {
			await service.linkIdentity(tx.userId, claims.iss, claims.sub, tx.stamp);
			return res.redirect(303, new URL("/?oidc=linked", config.public_url).href);
		}
		const user = await service.linkedUser(claims.iss, claims.sub);
		putCookie(
			res,
			handoffCookie,
			handoffs.put({ userId: user.id, issuer: claims.iss, subject: claims.sub, revision }),
			60,
		);
		res.redirect(303, new URL("/?oidc=complete", config.public_url).href);
	} catch {
		res.status(401)
			.type("html")
			.send(
				'<!doctype html><meta name="referrer" content="no-referrer"><p>OIDC login failed. Sign in locally to link your account or check the provider configuration.</p><a href="/?local=1">Local login</a>',
			);
	}
});
router.post(
	"/exchange",
	handler(async (req, res) => {
		const { config, revision } = await service.readConfig();
		if (!sameOrigin(req, config)) return res.sendStatus(403);
		const handoff = handoffs.take(parse(req.headers.cookie || "")[handoffCookie]);
		clearCookie(res, handoffCookie);
		if (!handoff || !config.enabled || handoff.revision !== revision) return res.sendStatus(401);
		const user = await service.linkedUser(handoff.issuer, handoff.subject);
		if (user.id !== handoff.userId) return res.sendStatus(401);
		res.json(await service.loginResult(user));
	}),
);
export default router;
