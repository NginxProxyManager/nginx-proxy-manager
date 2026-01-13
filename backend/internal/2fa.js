import bcrypt from "bcrypt";
import crypto from "node:crypto";
import { authenticator } from "otplib";
import authModel from "../models/auth.js";
import userModel from "../models/user.js";
import errs from "../lib/error.js";

const APP_NAME = "NPMplus";
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

export default {
	/**
	 * Generate a new TOTP secret
	 * @returns {string}
	 */
	generateSecret: () => {
		return authenticator.generateSecret();
	},

	/**
	 * Generate otpauth URL for QR code
	 * @param {string} email
	 * @param {string} secret
	 * @returns {string}
	 */
	generateOTPAuthURL: (email, secret) => {
		return authenticator.keyuri(email, APP_NAME, secret);
	},

	/**
	 * Verify a TOTP code
	 * @param {string} secret
	 * @param {string} code
	 * @returns {boolean}
	 */
	verifyCode: (secret, code) => {
		try {
			return authenticator.verify({ token: code, secret });
		} catch {
			return false;
		}
	},

	/**
	 * Check if user has 2FA enabled
	 * @param {number} userId
	 * @returns {Promise<boolean>}
	 */
	isEnabled: async (userId) => {
		const auth = await authModel.query().where("user_id", userId).where("type", "password").first();

		if (!auth || !auth.meta) {
			return false;
		}

		return auth.meta.totp_enabled === true;
	},

	/**
	 * Get 2FA status for user
	 * @param {number} userId
	 * @returns {Promise<{enabled: boolean, backupCodesRemaining: number}>}
	 */
	getStatus: async (userId) => {
		const auth = await authModel.query().where("user_id", userId).where("type", "password").first();

		if (!auth || !auth.meta || !auth.meta.totp_enabled) {
			return { enabled: false, backupCodesRemaining: 0 };
		}

		const backupCodes = auth.meta.backup_codes || [];
		return {
			enabled: true,
			backupCodesRemaining: backupCodes.length,
		};
	},

	/**
	 * Start 2FA setup - store pending secret
	 * @param {number} userId
	 * @returns {Promise<{secret: string, otpauthUrl: string}>}
	 */
	startSetup: async (userId) => {
		const user = await userModel.query().where("id", userId).first();
		if (!user) {
			throw new errs.ItemNotFoundError("User not found");
		}

		const secret = authenticator.generateSecret();
		const otpauthUrl = authenticator.keyuri(user.email, APP_NAME, secret);

		const auth = await authModel.query().where("user_id", userId).where("type", "password").first();

		if (!auth) {
			throw new errs.ItemNotFoundError("Auth record not found");
		}

		const meta = auth.meta || {};
		meta.totp_pending_secret = secret;

		await authModel.query().where("id", auth.id).patch({ meta });

		return { secret, otpauthUrl };
	},

	/**
	 * Enable 2FA after verifying code
	 * @param {number} userId
	 * @param {string} code
	 * @returns {Promise<{backupCodes: string[]}>}
	 */
	enable: async (userId, code) => {
		const auth = await authModel.query().where("user_id", userId).where("type", "password").first();

		if (!auth || !auth.meta || !auth.meta.totp_pending_secret) {
			throw new errs.ValidationError("No pending 2FA setup found");
		}

		const secret = auth.meta.totp_pending_secret;
		const valid = authenticator.verify({ token: code, secret });

		if (!valid) {
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

		await authModel.query().where("id", auth.id).patch({ meta });

		return { backupCodes: plain };
	},

	/**
	 * Disable 2FA
	 * @param {number} userId
	 * @param {string} code
	 * @returns {Promise<void>}
	 */
	disable: async (userId, code) => {
		const auth = await authModel.query().where("user_id", userId).where("type", "password").first();

		if (!auth || !auth.meta || !auth.meta.totp_enabled) {
			throw new errs.ValidationError("2FA is not enabled");
		}

		const valid = authenticator.verify({
			token: code,
			secret: auth.meta.totp_secret,
		});

		if (!valid) {
			throw new errs.ValidationError("Invalid verification code");
		}

		const meta = { ...auth.meta };
		delete meta.totp_secret;
		delete meta.totp_enabled;
		delete meta.totp_enabled_at;
		delete meta.backup_codes;

		await authModel.query().where("id", auth.id).patch({ meta });
	},

	/**
	 * Verify 2FA code for login
	 * @param {number} userId
	 * @param {string} code
	 * @returns {Promise<boolean>}
	 */
	verifyForLogin: async (userId, code) => {
		const auth = await authModel.query().where("user_id", userId).where("type", "password").first();

		if (!auth || !auth.meta || !auth.meta.totp_secret) {
			return false;
		}

		// Try TOTP code first
		const valid = authenticator.verify({
			token: code,
			secret: auth.meta.totp_secret,
		});

		if (valid) {
			return true;
		}

		// Try backup codes
		const backupCodes = auth.meta.backup_codes || [];
		for (let i = 0; i < backupCodes.length; i++) {
			const match = await bcrypt.compare(code.toUpperCase(), backupCodes[i]);
			if (match) {
				// Remove used backup code
				const updatedCodes = [...backupCodes];
				updatedCodes.splice(i, 1);
				const meta = { ...auth.meta, backup_codes: updatedCodes };
				await authModel.query().where("id", auth.id).patch({ meta });
				return true;
			}
		}

		return false;
	},

	/**
	 * Regenerate backup codes
	 * @param {number} userId
	 * @param {string} code
	 * @returns {Promise<{backupCodes: string[]}>}
	 */
	regenerateBackupCodes: async (userId, code) => {
		const auth = await authModel.query().where("user_id", userId).where("type", "password").first();

		if (!auth || !auth.meta || !auth.meta.totp_enabled) {
			throw new errs.ValidationError("2FA is not enabled");
		}

		const valid = authenticator.verify({
			token: code,
			secret: auth.meta.totp_secret,
		});

		if (!valid) {
			throw new errs.ValidationError("Invalid verification code");
		}

		const { plain, hashed } = await generateBackupCodes();

		const meta = { ...auth.meta, backup_codes: hashed };
		await authModel.query().where("id", auth.id).patch({ meta });

		return { backupCodes: plain };
	},
};
