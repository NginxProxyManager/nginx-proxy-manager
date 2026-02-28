import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { createGuardrails, generateSecret, generateURI, verify } from "otplib";
import errs from "../lib/error.js";
import authModel from "../models/auth.js";
import internalUser from "./user.js";

const APP_NAME = "Nginx Proxy Manager";
const BACKUP_CODE_COUNT = 8;

/**
 * Generate backup codes
 * @returns {Promise<{plain: string[], hashed: string[]}>}
 */
const generateBackupCodes = async () => {
	const plain = [];
	const hashed = [];

	for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
		const code = crypto.randomBytes(4).toString("hex").toUpperCase();
		plain.push(code);
		const hash = await bcrypt.hash(code, 10);
		hashed.push(hash);
	}

	return { plain, hashed };
};

const internal2fa = {
	/**
	 * Check if user has 2FA enabled
	 * @param {number} userId
	 * @returns {Promise<boolean>}
	 */
	isEnabled: async (userId) => {
		const auth = await internal2fa.getUserPasswordAuth(userId);
		return auth?.meta?.totp_enabled === true;
	},

	/**
	 * Get 2FA status for user
	 * @param   {Access}  access
	 * @param   {number}  userId
	 * @returns {Promise<{enabled: boolean, backup_codes_remaining: number}>}
	 */
	getStatus: async (access, userId) => {
		await access.can("users:password", userId);
		await internalUser.get(access, { id: userId });
		const auth = await internal2fa.getUserPasswordAuth(userId);
		const enabled = auth?.meta?.totp_enabled === true;
		let backup_codes_remaining = 0;

		if (enabled) {
			const backupCodes = auth.meta.backup_codes || [];
			backup_codes_remaining = backupCodes.length;
		}

		return {
			enabled,
			backup_codes_remaining,
		};
	},

	/**
	 * Start 2FA setup - store pending secret
	 *
	 * @param   {Access}  access
	 * @param   {number} userId
	 * @returns {Promise<{secret: string, otpauth_url: string}>}
	 */
	startSetup: async (access, userId) => {
		await access.can("users:password", userId);
		const user = await internalUser.get(access, { id: userId });
		const secret = generateSecret();
		const otpauth_url = generateURI({
			issuer: APP_NAME,
			label: user.email,
			secret: secret,
		});
		const auth = await internal2fa.getUserPasswordAuth(userId);

		// ensure user isn't already setup for 2fa
		const enabled = auth?.meta?.totp_enabled === true;
		if (enabled) {
			throw new errs.ValidationError("2FA is already enabled");
		}

		const meta = auth.meta || {};
		meta.totp_pending_secret = secret;

		await authModel
			.query()
			.where("id", auth.id)
			.andWhere("user_id", userId)
			.andWhere("type", "password")
			.patch({ meta });

		return { secret, otpauth_url };
	},

	/**
	 * Enable 2FA after verifying code
	 *
	 * @param   {Access}  access
	 * @param   {number}  userId
	 * @param   {string}  code
	 * @returns {Promise<{backup_codes: string[]}>}
	 */
	enable: async (access, userId, code) => {
		await access.can("users:password", userId);
		await internalUser.get(access, { id: userId });
		const auth = await internal2fa.getUserPasswordAuth(userId);
		const secret = auth?.meta?.totp_pending_secret || false;

		if (!secret) {
			throw new errs.ValidationError("No pending 2FA setup found");
		}

		const result = await verify({ token: code, secret });
		if (!result.valid) {
			throw new errs.ValidationError("Invalid verification code");
		}

		const { plain, hashed } = await generateBackupCodes();

		const meta = {
			...auth.meta,
			totp_secret: secret,
			totp_enabled: true,
			totp_enabled_at: new Date().toISOString(),
			backup_codes: hashed,
		};
		delete meta.totp_pending_secret;

		await authModel
			.query()
			.where("id", auth.id)
			.andWhere("user_id", userId)
			.andWhere("type", "password")
			.patch({ meta });

		return { backup_codes: plain };
	},

	/**
	 * Disable 2FA
	 *
	 * @param   {Access}  access
	 * @param   {number} userId
	 * @param   {string} code
	 * @returns {Promise<void>}
	 */
	disable: async (access, userId, code) => {
		await access.can("users:password", userId);
		await internalUser.get(access, { id: userId });
		const auth = await internal2fa.getUserPasswordAuth(userId);

		const enabled = auth?.meta?.totp_enabled === true;
		if (!enabled) {
			throw new errs.ValidationError("2FA is not enabled");
		}

		const result = await verify({
            token: code,
            secret: auth.meta.totp_secret,
            guardrails: createGuardrails({
                MIN_SECRET_BYTES: 10,
            }),
        });

		if (!result.valid) {
			throw new errs.AuthError("Invalid verification code");
		}

		const meta = { ...auth.meta };
		delete meta.totp_secret;
		delete meta.totp_enabled;
		delete meta.totp_enabled_at;
		delete meta.backup_codes;

		await authModel
			.query()
			.where("id", auth.id)
			.andWhere("user_id", userId)
			.andWhere("type", "password")
			.patch({ meta });
	},

	/**
	 * Verify 2FA code for login
	 *
	 * @param   {number} userId
	 * @param   {string} token
	 * @returns {Promise<boolean>}
	 */
	verifyForLogin: async (userId, token) => {
		const auth = await internal2fa.getUserPasswordAuth(userId);
		const secret = auth?.meta?.totp_secret || false;

		if (!secret) {
			return false;
		}

		// Try TOTP code first, if it's 6 chars. it will throw errors if it's not 6 chars
		// and the backup codes are 8 chars.
		if (token.length === 6) {
			const result = await verify({
				token,
				secret,
				// These guardrails lower the minimum length requirement for secrets.
				// In v12 of otplib the default minimum length is 10 and in v13 it is 16.
				// Since there are 2fa secrets in the wild generated with v12 we need to allow shorter secrets
				// so people won't be locked out when upgrading.
				guardrails: createGuardrails({
					MIN_SECRET_BYTES: 10,
				}),
			});

			if (result.valid) {
				return true;
			}
		}

		// Try backup codes
		const backupCodes = auth?.meta?.backup_codes || [];
		for (let i = 0; i < backupCodes.length; i++) {
			const match = await bcrypt.compare(token.toUpperCase(), backupCodes[i]);
			if (match) {
				// Remove used backup code
				const updatedCodes = [...backupCodes];
				updatedCodes.splice(i, 1);
				const meta = { ...auth.meta, backup_codes: updatedCodes };
				await authModel
					.query()
					.where("id", auth.id)
					.andWhere("user_id", userId)
					.andWhere("type", "password")
					.patch({ meta });
				return true;
			}
		}

		return false;
	},

	/**
	 * Regenerate backup codes
	 *
	 * @param   {Access}  access
	 * @param   {number}  userId
	 * @param   {string}  token
	 * @returns {Promise<{backup_codes: string[]}>}
	 */
	regenerateBackupCodes: async (access, userId, token) => {
		await access.can("users:password", userId);
		await internalUser.get(access, { id: userId });
		const auth = await internal2fa.getUserPasswordAuth(userId);
		const enabled = auth?.meta?.totp_enabled === true;
		const secret = auth?.meta?.totp_secret || false;

		if (!enabled) {
			throw new errs.ValidationError("2FA is not enabled");
		}
		if (!secret) {
			throw new errs.ValidationError("No 2FA secret found");
		}

		const result = await verify({
			token,
			secret,
		});

		if (!result.valid) {
			throw new errs.ValidationError("Invalid verification code");
		}

		const { plain, hashed } = await generateBackupCodes();

		const meta = { ...auth.meta, backup_codes: hashed };
		await authModel
			.query()
			.where("id", auth.id)
			.andWhere("user_id", userId)
			.andWhere("type", "password")
			.patch({ meta });

		return { backup_codes: plain };
	},

	getUserPasswordAuth: async (userId) => {
		const auth = await authModel
			.query()
			.where("user_id", userId)
			.andWhere("type", "password")
			.first();

		if (!auth) {
			throw new errs.ItemNotFoundError("Auth not found");
		}

		return auth;
	},
};

export default internal2fa;
