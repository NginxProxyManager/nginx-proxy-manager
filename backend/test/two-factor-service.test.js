import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import bcrypt from "bcrypt";
import { generate, generateSecret } from "otplib";

const testRoot = await mkdtemp(path.join(os.tmpdir(), "npm-2fa-test-"));
process.env.NPM_KEYS_FILE = path.join(testRoot, "keys.json");
process.env.DB_SQLITE_FILE = path.join(testRoot, "database.sqlite");

const [{ default: service }, { default: authModel }, { default: userService }] = await Promise.all([
	import("../internal/2fa.js"),
	import("../models/auth.js"),
	import("../internal/user.js"),
]);

const access = { can: async () => true };

test("2FA status and setup persist a pending secret and reject duplicate setup", async () => {
	const originals = { auth: service.getUserPasswordAuth, user: userService.get, query: authModel.query };
	const patches = [];
	userService.get = async () => ({ id: 7, email: "owner@example.test" });
	authModel.query = () => {
		const chain = { where: () => chain, andWhere: () => chain, patch: async (data) => patches.push(data) };
		return chain;
	};
	try {
		service.getUserPasswordAuth = async () => ({ id: 3, meta: { totp_enabled: false } });
		assert.equal(await service.isEnabled(7), false);
		assert.deepEqual(await service.getStatus(access, 7), { enabled: false, backup_codes_remaining: 0 });
		const setup = await service.startSetup(access, 7);
		assert.ok(setup.secret);
		assert.match(setup.otpauth_url, /^otpauth:/);
		assert.equal(patches[0].meta.totp_pending_secret, setup.secret);
		service.getUserPasswordAuth = async () => ({ id: 3, meta: { totp_enabled: true, backup_codes: ["one", "two"] } });
		assert.equal(await service.isEnabled(7), true);
		assert.deepEqual(await service.getStatus(access, 7), { enabled: true, backup_codes_remaining: 2 });
		await assert.rejects(() => service.startSetup(access, 7), /already enabled/);
	} finally {
		service.getUserPasswordAuth = originals.auth;
		userService.get = originals.user;
		authModel.query = originals.query;
	}
});

test("2FA enable and disable validate live codes and update authentication metadata", async () => {
	const originals = { auth: service.getUserPasswordAuth, user: userService.get, query: authModel.query };
	const patches = [];
	const secret = generateSecret();
	const code = await generate({ secret });
	userService.get = async () => ({ id: 7 });
	authModel.query = () => {
		const chain = { where: () => chain, andWhere: () => chain, patch: async (data) => patches.push(data) };
		return chain;
	};
	try {
		service.getUserPasswordAuth = async () => ({ id: 3, meta: {} });
		await assert.rejects(() => service.enable(access, 7, code), /No pending/);
		service.getUserPasswordAuth = async () => ({ id: 3, meta: { totp_pending_secret: secret } });
		await assert.rejects(() => service.enable(access, 7, "000000"), /Invalid verification/);
		const enabled = await service.enable(access, 7, code);
		assert.equal(enabled.backup_codes.length, 8);
		assert.equal(patches.at(-1).meta.totp_enabled, true);
		assert.equal(patches.at(-1).meta.backup_codes.length, 8);

		service.getUserPasswordAuth = async () => ({ id: 3, meta: {} });
		await assert.rejects(() => service.disable(access, 7, code), /not enabled/);
		service.getUserPasswordAuth = async () => ({ id: 3, meta: { totp_enabled: true, totp_secret: secret, backup_codes: [] } });
		await assert.rejects(() => service.disable(access, 7, "000000"), /Invalid verification/);
		await service.disable(access, 7, code);
		assert.equal(patches.at(-1).meta.totp_enabled, undefined);
	} finally {
		service.getUserPasswordAuth = originals.auth;
		userService.get = originals.user;
		authModel.query = originals.query;
	}
});

test("2FA login accepts TOTP and consumes one-time backup codes", async () => {
	const originals = { auth: service.getUserPasswordAuth, query: authModel.query };
	const secret = generateSecret();
	const code = await generate({ secret });
	const backupHash = await bcrypt.hash("ABCDEF12", 4);
	const patches = [];
	authModel.query = () => {
		const chain = { where: () => chain, andWhere: () => chain, patch: async (data) => patches.push(data) };
		return chain;
	};
	try {
		service.getUserPasswordAuth = async () => ({ id: 3, meta: {} });
		assert.equal(await service.verifyForLogin(7, code), false);
		service.getUserPasswordAuth = async () => ({ id: 3, meta: { totp_secret: secret, backup_codes: [backupHash] } });
		assert.equal(await service.verifyForLogin(7, code), true);
		assert.equal(await service.verifyForLogin(7, "ABCDEF12"), true);
		assert.deepEqual(patches[0].meta.backup_codes, []);
		assert.equal(await service.verifyForLogin(7, "BADCODE1"), false);
	} finally {
		service.getUserPasswordAuth = originals.auth;
		authModel.query = originals.query;
	}
});

test("2FA backup regeneration and password-auth lookup cover validation branches", async () => {
	const originals = { auth: service.getUserPasswordAuth, user: userService.get, query: authModel.query };
	const secret = generateSecret();
	const code = await generate({ secret });
	const patches = [];
	userService.get = async () => ({ id: 7 });
	authModel.query = () => {
		const chain = {
			where: () => chain,
			andWhere: () => chain,
			first: async () => ({ id: 3, meta: {} }),
			patch: async (data) => patches.push(data),
		};
		return chain;
	};
	try {
		service.getUserPasswordAuth = async () => ({ id: 3, meta: {} });
		await assert.rejects(() => service.regenerateBackupCodes(access, 7, code), /not enabled/);
		service.getUserPasswordAuth = async () => ({ id: 3, meta: { totp_enabled: true } });
		await assert.rejects(() => service.regenerateBackupCodes(access, 7, code), /No 2FA secret/);
		service.getUserPasswordAuth = async () => ({ id: 3, meta: { totp_enabled: true, totp_secret: secret } });
		await assert.rejects(() => service.regenerateBackupCodes(access, 7, "000000"), /Invalid verification/);
		const regenerated = await service.regenerateBackupCodes(access, 7, code);
		assert.equal(regenerated.backup_codes.length, 8);
		assert.equal(patches.at(-1).meta.backup_codes.length, 8);

		service.getUserPasswordAuth = originals.auth;
		assert.equal((await service.getUserPasswordAuth(7)).id, 3);
		authModel.query = () => {
			const chain = { where: () => chain, andWhere: () => chain, first: async () => null };
			return chain;
		};
		await assert.rejects(() => service.getUserPasswordAuth(7), /Not Found - Auth not found/);
	} finally {
		service.getUserPasswordAuth = originals.auth;
		userService.get = originals.user;
		authModel.query = originals.query;
	}
});
