import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const testRoot = await mkdtemp(path.join(os.tmpdir(), "npm-token-test-"));
process.env.NPM_KEYS_FILE = path.join(testRoot, "keys.json");
process.env.DB_SQLITE_FILE = path.join(testRoot, "database.sqlite");

const [
	{ default: tokenService },
	{ default: tokenFactory },
	{ default: userModel },
	{ default: authModel },
	{ default: twoFactor },
] = await Promise.all([
	import("../internal/token.js"),
	import("../models/token.js"),
	import("../models/user.js"),
	import("../models/auth.js"),
	import("../internal/2fa.js"),
]);

const chainWithFirst = (value) => {
	const chain = {
		where: () => chain,
		andWhere: () => chain,
		first: async () => value,
	};
	return chain;
};

test("email token authentication rejects missing users, auth records, passwords, and scopes", async () => {
	const originalUserQuery = userModel.query;
	const originalAuthQuery = authModel.query;
	const originalEnabled = twoFactor.isEnabled;
	let user = null;
	let auth = null;
	userModel.query = () => chainWithFirst(user);
	authModel.query = () => chainWithFirst(auth);
	twoFactor.isEnabled = async () => false;

	try {
		await assert.rejects(() => tokenService.getTokenFromEmail({ identity: "missing@example.test", secret: "x" }), /Invalid email/);
		user = { id: 7, roles: ["admin"] };
		await assert.rejects(() => tokenService.getTokenFromEmail({ identity: "owner@example.test", secret: "x" }), /Invalid email/);
		auth = { verifyPassword: async () => false };
		await assert.rejects(
			() => tokenService.getTokenFromEmail({ identity: "owner@example.test", secret: "wrong" }),
			(error) => error.status === 400 && error.message_i18n === "error.invalid-auth",
		);
		auth = { verifyPassword: async () => true };
		await assert.rejects(
			() => tokenService.getTokenFromEmail({ identity: "owner@example.test", secret: "right", scope: "worker" }),
			/Invalid scope/,
		);
		await assert.rejects(
			() => tokenService.getTokenFromEmail({ identity: "owner@example.test", secret: "right", expiry: "nonsense" }),
			/Invalid expiry/,
		);
	} finally {
		userModel.query = originalUserQuery;
		authModel.query = originalAuthQuery;
		twoFactor.isEnabled = originalEnabled;
	}
});

test("email token authentication issues normal and 2FA challenge tokens", async () => {
	const originalUserQuery = userModel.query;
	const originalAuthQuery = authModel.query;
	const originalEnabled = twoFactor.isEnabled;
	const user = { id: 7, roles: ["admin"] };
	userModel.query = () => chainWithFirst(user);
	authModel.query = () => chainWithFirst({ verifyPassword: async () => true });
	try {
		twoFactor.isEnabled = async () => false;
		const normal = await tokenService.getTokenFromEmail({ identity: " OWNER@example.test ", secret: "right" }, "tests");
		assert.ok(normal.token);
		assert.ok(normal.expires);

		twoFactor.isEnabled = async () => true;
		const challenge = await tokenService.getTokenFromEmail({ identity: "owner@example.test", secret: "right" });
		assert.equal(challenge.requires_2fa, true);
		assert.ok(challenge.challenge_token);
		const decoded = await tokenFactory().load(challenge.challenge_token);
		assert.deepEqual(decoded.scope, ["2fa-challenge"]);
	} finally {
		userModel.query = originalUserQuery;
		authModel.query = originalAuthQuery;
		twoFactor.isEnabled = originalEnabled;
	}
});

test("fresh token retains scope and lets admins request worker scopes", async () => {
	const makeAccess = ({ userId = 7, scope = ["user"], admin = false } = {}) => ({
		token: {
			getUserId: () => userId,
			get: () => scope,
			hasScope: (value) => value === "admin" && admin,
		},
	});
	const normal = await tokenService.getFreshToken(makeAccess(), {});
	assert.ok(normal.token);
	assert.ok(normal.expires);

	const worker = await tokenService.getFreshToken(makeAccess({ scope: ["admin"], admin: true }), { scope: "worker", expiry: "2h" });
	const decoded = await tokenFactory().load(worker.token);
	assert.deepEqual(decoded.scope, ["worker"]);
	assert.equal(decoded.attrs.id, 0);

	await assert.rejects(() => tokenService.getFreshToken(makeAccess(), { expiry: "invalid" }), /Invalid expiry/);
	await assert.rejects(() => tokenService.getFreshToken(makeAccess({ userId: 0 })), /invalid user data/);
});

test("2FA verification rejects invalid challenges, codes, and expiry before issuing a user token", async () => {
	const originalVerify = twoFactor.verifyForLogin;
	try {
		await assert.rejects(() => tokenService.verify2FA("invalid", "123456"), /Invalid or expired/);
		const wrongScope = await tokenFactory().create({ attrs: { id: 7 }, scope: ["user"], expiresIn: "5m" });
		await assert.rejects(() => tokenService.verify2FA(wrongScope.token, "123456"), /Invalid challenge token/);
		const missingUser = await tokenFactory().create({ attrs: {}, scope: ["2fa-challenge"], expiresIn: "5m" });
		await assert.rejects(() => tokenService.verify2FA(missingUser.token, "123456"), /Invalid challenge token/);

		const challenge = await tokenFactory().create({ attrs: { id: 7 }, scope: ["2fa-challenge"], expiresIn: "5m" });
		twoFactor.verifyForLogin = async () => false;
		await assert.rejects(
			() => tokenService.verify2FA(challenge.token, "bad"),
			(error) => error.message_i18n === "error.invalid-2fa",
		);
		twoFactor.verifyForLogin = async () => true;
		await assert.rejects(() => tokenService.verify2FA(challenge.token, "123456", "invalid"), /Invalid expiry/);
		const result = await tokenService.verify2FA(challenge.token, "123456", "2h");
		assert.ok(result.token);
		assert.deepEqual((await tokenFactory().load(result.token)).scope, ["user"]);
	} finally {
		twoFactor.verifyForLogin = originalVerify;
	}
});

test("login-as-user token includes the selected user", async () => {
	const user = { id: 12, email: "person@example.test" };
	const result = await tokenService.getTokenFromUser(user);
	assert.equal(result.user, user);
	assert.ok(result.token);
	assert.ok(result.expires);
});
