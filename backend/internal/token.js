import _ from "lodash";
import errs from "../lib/error.js";
import { parseDatePeriod } from "../lib/helpers.js";
import authModel from "../models/auth.js";
import TokenModel from "../models/token.js";
import userModel from "../models/user.js";

const ERROR_MESSAGE_INVALID_AUTH = "Invalid email or password";
const ERROR_MESSAGE_INVALID_AUTH_I18N = "error.invalid-auth";

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
	getTokenFromEmail: (data, issuer) => {
		const Token = TokenModel();

		data.scope = data.scope || "user";
		data.expiry = data.expiry || "1d";

		return userModel
			.query()
			.where("email", data.identity.toLowerCase().trim())
			.andWhere("is_deleted", 0)
			.andWhere("is_disabled", 0)
			.first()
			.then((user) => {
				if (user) {
					// Get auth
					return authModel
						.query()
						.where("user_id", "=", user.id)
						.where("type", "=", "password")
						.first()
						.then((auth) => {
							if (auth) {
								return auth.verifyPassword(data.secret).then((valid) => {
									if (valid) {
										if (data.scope !== "user" && _.indexOf(user.roles, data.scope) === -1) {
											// The scope requested doesn't exist as a role against the user,
											// you shall not pass.
											throw new errs.AuthError(`Invalid scope: ${data.scope}`);
										}

										// Create a moment of the expiry expression
										const expiry = parseDatePeriod(data.expiry);
										if (expiry === null) {
											throw new errs.AuthError(`Invalid expiry time: ${data.expiry}`);
										}

										return Token.create({
											iss: issuer || "api",
											attrs: {
												id: user.id,
											},
											scope: [data.scope],
											expiresIn: data.expiry,
										}).then((signed) => {
											return {
												token: signed.token,
												expires: expiry.toISOString(),
											};
										});
									}
									throw new errs.AuthError(
										ERROR_MESSAGE_INVALID_AUTH,
										ERROR_MESSAGE_INVALID_AUTH_I18N,
									);
								});
							}
							throw new errs.AuthError(ERROR_MESSAGE_INVALID_AUTH);
						});
				}
				throw new errs.AuthError(ERROR_MESSAGE_INVALID_AUTH);
			});
	},

	/**
	 * @param {Access} access
	 * @param {Object} [data]
	 * @param {String} [data.expiry]
	 * @param {String} [data.scope]   Only considered if existing token scope is admin
	 * @returns {Promise}
	 */
	getFreshToken: (access, data) => {
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

			return Token.create({
				iss: "api",
				scope: scope,
				attrs: token_attrs,
				expiresIn: thisData.expiry,
			}).then((signed) => {
				return {
					token: signed.token,
					expires: expiry.toISOString(),
				};
			});
		}
		throw new error.AssertionFailedError("Existing token contained invalid user data");
	},

	/**
	 * @param   {Object} user
	 * @returns {Promise}
	 */
	getTokenFromUser: async (user) => {
		const expire = "1d";
		const Token = new TokenModel();
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
