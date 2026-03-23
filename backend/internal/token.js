import _ from "lodash";
import errs from "../lib/error.js";
import { parseDatePeriod } from "../lib/helpers.js";
import { applyEnvOverrides, rowToLdapClientConfig } from "../lib/ldap-env.js";
import authModel from "../models/auth.js";
import LdapConfig from "../models/ldap_config.js";
import TokenModel from "../models/token.js";
import userModel from "../models/user.js";
import twoFactor from "./2fa.js";
import internalLdap from "./ldap.js";
import ldapSync from "./ldap-sync.js";
import { global as tokenLogger } from "../logger.js";

const ERROR_MESSAGE_INVALID_AUTH = "Invalid email or password";
const ERROR_MESSAGE_INVALID_AUTH_I18N = "error.invalid-auth";
const ERROR_MESSAGE_INVALID_2FA = "Invalid verification code";
const ERROR_MESSAGE_INVALID_2FA_I18N = "error.invalid-2fa";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Finalise authentication for a resolved NPM user: check 2FA and issue a JWT.
 *
 * @param  {Object} user
 * @param  {Object} data   — original request data (scope, expiry)
 * @param  {string} issuer
 * @param  {Object} Token  — TokenModel instance
 * @returns {Promise<Object>}
 */
const issueTokenForUser = async (user, data, issuer, Token) => {
	if (data.scope !== "user" && _.indexOf(user.roles, data.scope) === -1) {
		throw new errs.AuthError(`Invalid scope: ${data.scope}`);
	}

	// Check if 2FA is enabled
	const has2FA = await twoFactor.isEnabled(user.id);
	if (has2FA) {
		const challengeToken = await Token.create({
			iss: issuer || "api",
			attrs: { id: user.id },
			scope: ["2fa-challenge"],
			expiresIn: "5m",
		});

		return {
			requires_2fa: true,
			challenge_token: challengeToken.token,
		};
	}

	const expiry = parseDatePeriod(data.expiry);
	if (expiry === null) {
		throw new errs.AuthError(`Invalid expiry time: ${data.expiry}`);
	}

	const signed = await Token.create({
		iss: issuer || "api",
		attrs: { id: user.id },
		scope: [data.scope],
		expiresIn: data.expiry,
	});

	return {
		token: signed.token,
		expires: expiry.toISOString(),
	};
};

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export default {
	/**
	 * Authenticate via email/password (local) or LDAP, then return a JWT.
	 *
	 * Authentication order:
	 *   1. Look for a local NPM user with matching email AND auth_source='local'.
	 *   2. If found → verify bcrypt password hash.  Return token on success.
	 *   3. If NOT found (no matching local user, or user is LDAP-sourced) →
	 *      attempt LDAP authentication if LDAP is enabled.
	 *   4. On LDAP success → JIT-provision the user, then issue token.
	 *   5. Any failure → generic "Invalid email or password" (no info leak).
	 *
	 * The `identity` field accepts either an e-mail address OR a plain username.
	 * Plain usernames are handled directly by LDAP; they will never match a
	 * local user (which requires an email).
	 *
	 * @param   {Object} data
	 * @param   {String} data.identity  — email address OR LDAP username
	 * @param   {String} data.secret    — password
	 * @param   {String} [data.scope]
	 * @param   {String} [data.expiry]
	 * @param   {String} [issuer]
	 * @returns {Promise}
	 */
	getTokenFromEmail: async (data, issuer) => {
		const Token = TokenModel();

		data.scope  = data.scope  || "user";
		data.expiry = data.expiry || "1d";

		const identity = (data.identity || "").toLowerCase().trim();

		// ---------------------------------------------------------------
		// Step 1 — Try local authentication (email + auth_source='local')
		// ---------------------------------------------------------------
		const localUser = await userModel
			.query()
			.where("email", identity)
			.andWhere("is_deleted", 0)
			.andWhere("is_disabled", 0)
			.andWhere("auth_source", "local")
			.first();

		if (localUser) {
			// Found a local account — only local auth applies; no LDAP fallback.
			const auth = await authModel
				.query()
				.where("user_id", "=", localUser.id)
				.where("type", "=", "password")
				.first();

			if (!auth) {
				throw new errs.AuthError(ERROR_MESSAGE_INVALID_AUTH, ERROR_MESSAGE_INVALID_AUTH_I18N);
			}

			const valid = await auth.verifyPassword(data.secret);
			if (!valid) {
				throw new errs.AuthError(ERROR_MESSAGE_INVALID_AUTH, ERROR_MESSAGE_INVALID_AUTH_I18N);
			}

			return issueTokenForUser(localUser, data, issuer, Token);
		}

		// ---------------------------------------------------------------
		// Step 2 — LDAP authentication
		// No matching local user found (or user is LDAP-sourced).
		// identity may be an e-mail or a plain username.
		// ---------------------------------------------------------------
		let ldapRow = null;
		try {
			ldapRow = await LdapConfig.query().where("id", 1).first();
		} catch {
			// DB failure — treat as LDAP unavailable
		}

		const ldapConfig = applyEnvOverrides(ldapRow || {});
		const ldapEnabled = ldapConfig.enabled === true || ldapConfig.enabled === 1;

		if (!ldapEnabled) {
			// LDAP is not configured or disabled; nothing more to try.
			throw new errs.AuthError(ERROR_MESSAGE_INVALID_AUTH, ERROR_MESSAGE_INVALID_AUTH_I18N);
		}

		// Build camelCase config for internalLdap operations
		const ldapClientConfig = rowToLdapClientConfig(ldapConfig);

		let ldapUser = null;
		try {
			const ldapEntry = await internalLdap.authenticateUser(ldapClientConfig, identity, data.secret);
			const normalized = internalLdap.normalizeUser(ldapEntry, ldapClientConfig.userAttribute);

			// Resolve group memberships.
			// AD populates memberOf directly on the user entry; POSIX LDAP (OpenLDAP, 389-ds)
			// stores membership on the group (member/memberUid).  Fall back to a group search
			// so both directory types work.
			let ldapGroups = normalized.memberOf || [];
			if (ldapGroups.length === 0) {
				const groupEntries = await internalLdap.getUserGroups(ldapClientConfig, ldapEntry.dn, identity);
				ldapGroups = groupEntries.map((g) => g.dn).filter(Boolean);
			}

			// JIT provision: create or update the NPM user record.
			// Pass the raw (snake_case) ldapConfig so ldapSync can read admin_group / user_group.
			ldapUser = await ldapSync.provisionUser(normalized, ldapConfig, ldapGroups);
		} catch (ldapErr) {
			// LDAP auth or provisioning failed — fall through to generic error.
			tokenLogger.warn(`[ldap] Login failed for "${identity}": ${ldapErr?.message ? ldapErr.message : String(ldapErr)}`);
		}

		if (!ldapUser) {
			throw new errs.AuthError(ERROR_MESSAGE_INVALID_AUTH, ERROR_MESSAGE_INVALID_AUTH_I18N);
		}

		// Defense-in-depth: ldapSync.provisionUser must only return ldap-sourced accounts.
		// If for any reason a local account slips through, reject it here to prevent hijacking.
		if (ldapUser.auth_source !== "ldap") {
			tokenLogger.warn(`[ldap] Refusing to issue token: provisionUser returned user id=${ldapUser.id} with auth_source='${ldapUser.auth_source}' during LDAP login for "${identity}"`);
			throw new errs.AuthError(ERROR_MESSAGE_INVALID_AUTH, ERROR_MESSAGE_INVALID_AUTH_I18N);
		}

		return issueTokenForUser(ldapUser, data, issuer, Token);
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
