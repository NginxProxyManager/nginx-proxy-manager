import _ from "lodash";
import errs from "../lib/error.js";
import { parseDatePeriod } from "../lib/helpers.js";
import authModel from "../models/auth.js";
import TokenModel from "../models/token.js";
import userModel from "../models/user.js";
import twoFactor from "./2fa.js";

const ERROR_MESSAGE_INVALID_AUTH = "Invalid email or password";
const ERROR_MESSAGE_INVALID_AUTH_I18N = "error.invalid-auth";
const ERROR_MESSAGE_INVALID_2FA = "Invalid verification code";
const ERROR_MESSAGE_INVALID_2FA_I18N = "error.invalid-2fa";

export default {
	/**
	 * @param   {Object} data
	 * @param   {String} data.identity
	 * @param   {String} data.secret
	 * @param   {String} [data.scope]
	 * @param   {String} [data.expiry]
	 * @param   {String} [issuer]
	 * @returns {Promise}
	 */
	getTokenFromEmail: async (data, issuer) => {
		const Token = TokenModel();

		data.scope = data.scope || "user";
		data.expiry = data.expiry || "1d";

		const user = await userModel
			.query()
			.where("email", data.identity.toLowerCase().trim())
			.andWhere("is_deleted", 0)
			.andWhere("is_disabled", 0)
			.first();

		if (!user) {
			throw new errs.AuthError(ERROR_MESSAGE_INVALID_AUTH);
		}

		const auth = await authModel
			.query()
			.where("user_id", "=", user.id)
			.where("type", "=", "password")
			.first();

		if (!auth) {
			throw new errs.AuthError(ERROR_MESSAGE_INVALID_AUTH);
		}

		const valid = await auth.verifyPassword(data.secret);
		if (!valid) {
			throw new errs.AuthError(
				ERROR_MESSAGE_INVALID_AUTH,
				ERROR_MESSAGE_INVALID_AUTH_I18N,
			);
		}

		if (data.scope !== "user" && _.indexOf(user.roles, data.scope) === -1) {
			// The scope requested doesn't exist as a role against the user,
			// you shall not pass.
			throw new errs.AuthError(`Invalid scope: ${data.scope}`);
		}

		// Check if 2FA is enabled
		const has2FA = await twoFactor.isEnabled(user.id);
		if (has2FA) {
			// Return challenge token instead of full token
			const challengeToken = await Token.create({
				iss: issuer || "api",
				attrs: {
					id: user.id,
				},
				scope: ["2fa-challenge"],
				expiresIn: "5m",
			});

			return {
				requires_2fa: true,
				challenge_token: challengeToken.token,
			};
		}

		// Create a moment of the expiry expression
		const expiry = parseDatePeriod(data.expiry);
		if (expiry === null) {
			throw new errs.AuthError(`Invalid expiry time: ${data.expiry}`);
		}

		const signed = await Token.create({
			iss: issuer || "api",
			attrs: {
				id: user.id,
			},
			scope: [data.scope],
			expiresIn: data.expiry,
		});

		return {
			token: signed.token,
			expires: expiry.toISOString(),
		};
	},

	/**
	 * @param {Access} access
	 * @param {Object} [data]
	 * @param {String} [data.expiry]
	 * @param {String} [data.scope]   Only considered if existing token scope is admin
	 * @returns {Promise}
	 */
	getFreshToken: async (access, data) => {
		const Token = TokenModel();
		const thisData = data || {};

		thisData.expiry = thisData.expiry || "1d";

		if (access?.token.getUserId(0)) {
			// Create a moment of the expiry expression
			const expiry = parseDatePeriod(thisData.expiry);
			if (expiry === null) {
				throw new errs.AuthError(`Invalid expiry time: ${thisData.expiry}`);
			}

			const token_attrs = {
				id: access.token.getUserId(0),
			};

			// Only admins can request otherwise scoped tokens
			let scope = access.token.get("scope");
			if (thisData.scope && access.token.hasScope("admin")) {
				scope = [thisData.scope];

				if (thisData.scope === "job-board" || thisData.scope === "worker") {
					token_attrs.id = 0;
				}
			}

			const signed = await Token.create({
				iss: "api",
				scope: scope,
				attrs: token_attrs,
				expiresIn: thisData.expiry,
			});

			return {
				token: signed.token,
				expires: expiry.toISOString(),
			};
		}
		throw new error.AssertionFailedError("Existing token contained invalid user data");
	},

	/**
	 * Verify 2FA code and return full token
	 * @param {string} challengeToken
	 * @param {string} code
	 * @param {string} [expiry]
	 * @returns {Promise}
	 */
	verify2FA: async (challengeToken, code, expiry) => {
		const Token = TokenModel();
		const tokenExpiry = expiry || "1d";

		// Verify challenge token
		let tokenData;
		try {
			tokenData = await Token.load(challengeToken);
		} catch {
			throw new errs.AuthError("Invalid or expired challenge token");
		}

		// Check scope
		if (!tokenData.scope || tokenData.scope[0] !== "2fa-challenge") {
			throw new errs.AuthError("Invalid challenge token");
		}

		const userId = tokenData.attrs?.id;
		if (!userId) {
			throw new errs.AuthError("Invalid challenge token");
		}

		// Verify 2FA code
		const valid = await twoFactor.verifyForLogin(userId, code);
		if (!valid) {
			throw new errs.AuthError(
				ERROR_MESSAGE_INVALID_2FA,
				ERROR_MESSAGE_INVALID_2FA_I18N,
			);
		}

		// Create full token
		const expiryDate = parseDatePeriod(tokenExpiry);
		if (expiryDate === null) {
			throw new errs.AuthError(`Invalid expiry time: ${tokenExpiry}`);
		}

		const signed = await Token.create({
			iss: "api",
			attrs: {
				id: userId,
			},
			scope: ["user"],
			expiresIn: tokenExpiry,
		});

		return {
			token: signed.token,
			expires: expiryDate.toISOString(),
		};
	},

	/**
	 * @param   {Object} user
	 * @returns {Promise}
	 */
	getTokenFromUser: async (user) => {
		const expire = "1d";
		const Token = TokenModel();
		const expiry = parseDatePeriod(expire);

		const signed = await Token.create({
			iss: "api",
			attrs: {
				id: user.id,
			},
			scope: ["user"],
			expiresIn: expire,
		});

		return {
			token: signed.token,
			expires: expiry.toISOString(),
			user: user,
		};
	},
};
