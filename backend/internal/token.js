import _ from "lodash";
import errs from "../lib/error.js";
import { parseDatePeriod } from "../lib/helpers.js";
import authModel from "../models/auth.js";
import TokenModel from "../models/token.js";
import userModel from "../models/user.js";
import twoFactor from "./2fa.js";
import internalAuthProvider from "./auth-provider.js";

const ERROR_MESSAGE_INVALID_AUTH = "Invalid email or password";
const ERROR_MESSAGE_INVALID_AUTH_I18N = "error.invalid-auth";
const ERROR_MESSAGE_INVALID_2FA = "Invalid verification code";
const ERROR_MESSAGE_INVALID_2FA_I18N = "error.invalid-2fa";

const internalToken = {
	/**
	 * Verifies an email address and password against the locally stored
	 * credentials, ignoring any external authentication providers.
	 *
	 * @param   {String} email
	 * @param   {String} password
	 * @returns {Promise<Object|null>} the user, or null when the pair is wrong
	 */
	verifyLocalPassword: async (email, password) => {
		const user = await userModel
			.query()
			.where("email", email.toLowerCase().trim())
			.andWhere("is_deleted", 0)
			.andWhere("is_disabled", 0)
			.first();

		if (!user) {
			return null;
		}

		const auth = await authModel.query().where("user_id", "=", user.id).where("type", "=", "password").first();

		if (!auth?.secret) {
			return null;
		}

		const valid = await auth.verifyPassword(password);
		return valid ? user : null;
	},

	/**
	 * Issues an access token for a user that has already been authenticated,
	 * interrupting with a 2FA challenge when they have one enabled.
	 *
	 * @param   {Object} user
	 * @param   {String} [scope]
	 * @param   {String} [expiryPeriod]
	 * @param   {String} [issuer]
	 * @returns {Promise}
	 */
	issueForUser: async (user, scope, expiryPeriod, issuer) => {
		const Token = TokenModel();
		const thisScope = scope || "user";
		const thisExpiry = expiryPeriod || "1d";

		if (thisScope !== "user" && _.indexOf(user.roles, thisScope) === -1) {
			// The scope requested doesn't exist as a role against the user,
			// you shall not pass.
			throw new errs.AuthError(`Invalid scope: ${thisScope}`);
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
		const expiry = parseDatePeriod(thisExpiry);
		if (expiry === null) {
			throw new errs.AuthError(`Invalid expiry time: ${thisExpiry}`);
		}

		const signed = await Token.create({
			iss: issuer || "api",
			attrs: {
				id: user.id,
			},
			scope: [thisScope],
			expiresIn: thisExpiry,
		});

		return {
			token: signed.token,
			expires: expiry.toISOString(),
		};
	},

	/**
	 * Authenticates a set of credentials from the login form.
	 *
	 * Local passwords are checked first (when local sign in is enabled) and
	 * then every configured LDAP provider, so that directory users can use the
	 * same form as everyone else.
	 *
	 * @param   {Object} data
	 * @param   {String} data.identity
	 * @param   {String} data.secret
	 * @param   {String} [data.scope]
	 * @param   {String} [data.expiry]
	 * @param   {String} [issuer]
	 * @returns {Promise}
	 */
	getTokenFromEmail: async (data, issuer) => {
		const scope = data.scope || "user";
		const expiry = data.expiry || "1d";

		let user = null;

		if (await internalAuthProvider.isLocalAuthEnabled()) {
			user = await internalToken.verifyLocalPassword(data.identity, data.secret);
		}

		if (!user) {
			// LDAP identities are often a username rather than an email address,
			// so hand over what was typed rather than the normalised version.
			user = await internalAuthProvider.authenticateLdap(data.identity.trim(), data.secret);
		}

		if (!user) {
			throw new errs.AuthError(ERROR_MESSAGE_INVALID_AUTH, ERROR_MESSAGE_INVALID_AUTH_I18N);
		}

		return await internalToken.issueForUser(user, scope, expiry, issuer);
	},

	/**
	 * Issues a token for a user id, used once an external provider has
	 * vouched for who they are.
	 *
	 * @param   {Integer} userId
	 * @param   {String}  [issuer]
	 * @returns {Promise}
	 */
	getTokenFromUserId: async (userId, issuer) => {
		const user = await userModel
			.query()
			.where("id", userId)
			.andWhere("is_deleted", 0)
			.andWhere("is_disabled", 0)
			.first();

		if (!user) {
			throw new errs.AuthError(ERROR_MESSAGE_INVALID_AUTH);
		}

		return await internalToken.issueForUser(user, "user", "1d", issuer);
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
		throw new errs.AssertionFailedError("Existing token contained invalid user data");
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
			throw new errs.AuthError(ERROR_MESSAGE_INVALID_2FA, ERROR_MESSAGE_INVALID_2FA_I18N);
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

export default internalToken;
