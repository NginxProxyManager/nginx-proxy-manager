import internalToken from "../../internal/token.js";
import internalUser from "../../internal/user.js";
import { sso as logger } from "../../logger.js";
import now_helper from "../../models/now_helper.js";
import SingleSignOnClient from "../../models/sso_client.js";
import userModel from "../../models/user.js";
import errs from "../error.js";

/**
 * Returns an existing provisioned user, or provisions a new user if the
 * evaluation of the SSO Client configuration and authorized claims allow.
 *
 * @param {SingleSignOnClient} config
 * @param {Object} claims
 * @param {string} claims.sub
 * @param {string} claims.iss
 * @param {string} claims.email
 * @param {string[]} claims.groups
 * @param {string} claims.name
 * @param {string} claims.given_name
 * @param {string} claims.nickname
 * @param {string} claims.preferred_username
 * @param {string} claims.picture
 * @param {string} claims.profile_picture
 * @param {boolean} claims.email_verified
 * @param {User[]} users
 * @param {Knex.Transaction} transaction
 * @returns {Promise<User>} The provisioned user
 */
const getProvisionedUser = async (config, claims, users, transaction) => {
	const groups = claims.groups;
	const [existingPasswordUser, existingEmailUser, provisionedUser, disabledUser] = users;
	const emptyRoleMap = !config.provision_role_map || config.provision_role_map.length === 0;
	const ownerUserId = config.owner_user_id;

	const newUserData = {
		roles: [],
		email: claims.email,
		name: claims.name || claims.given_name || claims.nickname || claims.email,
		nickname: claims.nickname || claims.preferred_username || claims.email,
		avatar: claims.picture || claims.profile_picture || claims.avatar,
	};

	const authData = {
		sso_client_id: config.id,
		subject: claims.sub,
		issuer: claims.iss,
		audience: claims.aud,
		claimed_email: claims.email,
		auth_time: now_helper(),
	};

	let linkedUser;
	if (provisionedUser) {
		// Deny access for existing disabled provisioned user
		if (provisionedUser.is_disabled) {
			throw new Error("sso.error.not-permitted");
		}

		// Direct match to linked account of provisioned user, allow login to this account
		logger.info(`[${config.id}] Logging in to existing provisioned account user_id=${provisionedUser.id}`);
		await internalUser.ssoAccess(provisionedUser.id, "sso-idp", authData, transaction);
		await transaction.commit();

		linkedUser = provisionedUser;
	}

	if (existingEmailUser && existingEmailUser.subject === claims.sub && existingEmailUser.issuer === claims.iss) {
		// Allow login to an already linked account with different sso_client_id.
		logger.info(`[${config.id}] Logging in to existing provisioned account user_id=${existingEmailUser.id}`);
		await internalUser.ssoAccess(existingEmailUser.id, "sso-idp", authData, transaction);
		await transaction.commit();

		linkedUser = existingEmailUser;
	}

	if (linkedUser) {
		// Deny access with unverified email when required by setting
		if (config.require_verified_email && claims.email_verified !== true) {
			throw new Error("sso.error.login.verified-email");
		}

		return linkedUser;
	}

	if (!config.provision_users) {
		throw new Error("sso.error.signup.not-permitted");
	}

	// Reject provision with existing email (enforce unique)
	if (existingEmailUser) {
		throw new Error("sso.error.signup.unique-email");
	}

	// Reject provision with an email address for existing disabled user
	if (disabledUser) {
		throw new Error("sso.error.not-permitted");
	}

	// Reject provision with an email address for an existing internal user
	if (existingPasswordUser) {
		throw new Error("sso.error.signup.not-permitted-2");
	}

	// Reject provision unverified email when required by setting
	if (config.require_verified_email && claims.email_verified !== true) {
		throw new Error("sso.error.signup.verified-email");
	}

	const provisionArgs = [newUserData, authData, ownerUserId, transaction];

	// Provision to user role when no group membership is required
	if (!config.require_provision_group) {
		const newUser = await internalUser.provision(...provisionArgs);
		const action = `NO_GROUP_${newUser ? "PUSER" : "PAUTH"}`;
		logger.info(
			`[${config.id}] Provisioned new account user_id=${newUser.id} require_provision_group=${config.require_provision_group} ${action} user`,
		);

		return newUser;
	}

	// Sanity check
	if (config.require_provision_group && !config.require_provision_group_name && emptyRoleMap) {
		throw new Error("sso.error.config.group-required");
	}

	// All checks from here on require the groups claim.
	if (!groups || !Array.isArray(groups) || !groups.length) {
		throw new Error("sso.error.no-groups-claim-2");
	}

	// Provisioin to user role if group membership satisfies (no role mapping)
	if (config.require_provision_group && config.require_provision_group_name && emptyRoleMap) {
		if (!groups.includes(config.require_provision_group_name)) {
			throw new Error("sso.error.signup.group-required");
		}

		const newUser = await internalUser.provision(...provisionArgs);
		const action = `GROUP_MATCH_${newUser ? "PUSER" : "PAUTH"}`;
		logger.info(
			`[${config.id}] Provisioned new account user_id=${newUser.id} require_provision_group=${config.require_provision_group} require_provision_group_name=${config.require_provision_group_name} ${action} user`,
		);

		return newUser;
	}

	// Provision accoring to mapped role if group membership satisfies.
	if (config.require_provision_group && !config.require_provision_group_name && !emptyRoleMap) {
		let role;
		config.provision_role_map.forEach((map) => {
			if (groups.includes(map.group)) {
				role = role === "admin" ? role : map.role;
			}
		});

		if (!role) {
			throw new Error("sso.error.signup.group-required-2");
		}

		newUserData.roles = role === "admin" ? [role] : [];
		const newUser = await internalUser.provision(...provisionArgs);
		const action = `MAPPED_TO_ROLE_${newUser ? "PUSER" : "PAUTH"}`;
		logger.info(
			`[${config.id}] Provisioned account user_id=${newUser.id} require_provision_group=${config.require_provision_group} ${action} ${role}`,
		);

		return newUser;
	}

	// Provision to mapped role if both group memberships satisfy.
	if (config.require_provision_group && config.require_provision_group_name && !emptyRoleMap) {
		if (!groups.includes(config.require_provision_group_name)) {
			throw new Error("sso.error.signup.group-required-3");
		}

		let role;
		config.provision_role_map.forEach((map) => {
			if (groups.includes(map.group)) {
				role = role === "admin" ? role : map.role;
			}
		});

		if (!role) {
			throw new Error("sso.error.signup.group-required-3");
		}

		newUserData.roles = role === "admin" ? [role] : [];
		const newUser = await internalUser.provision(...provisionArgs);
		const action = `GROUP_MATCH_MAPPED_TO_ROLE_${newUser ? "PUSER" : "PAUTH"}`;
		logger.info(
			`[${config.id}] Provisioned account user_id=${newUser.id} require_provision_group=${config.require_provision_group} require_provision_group_name=${config.require_provision_group_name} ${action} ${role}`,
		);

		return newUser;
	}
};

const getInternalUser = async (config, claims, users, transaction) => {
	const [existingPasswordUser] = users;
	const groups = claims.groups;

	const auth = {
		sso_client_id: config.id,
		subject: claims.sub,
		issuer: claims.iss,
		audience: claims.aud,
		claimed_email: claims.email,
		auth_time: now_helper(),
	};

	if (!config.allow_internal) {
		throw new Error("sso.error.login.not-permitted");
	}

	if (!existingPasswordUser) {
		throw new Error("sso.error.login.not-found");
	}

	if (claims.email_verified !== true) {
		throw new Error("sso.error.login.verified-email");
	}

	if (config.allow_internal_if_admin && !existingPasswordUser.roles?.includes("admin")) {
		throw new Error("sso.error.login.not-permitted-2");
	}

	if (!config.require_group) {
		logger.info(
			`[${config.id}] Logging in to existing internal account user_id=${existingPasswordUser.id} NO_GROUP`,
		);
		await internalUser.ssoAccess(existingPasswordUser.id, "sso-npm", auth, transaction);
		await transaction.commit();

		return existingPasswordUser;
	}

	if (!groups || !Array.isArray(groups) || !groups.length) {
		throw new Error("sso.error.no-groups-claim");
	}

	if (!groups.includes(config.require_group_name)) {
		throw new Error("sso.error.login.group-required");
	}

	logger.info(
		`[${config.id}] Logging in to existing internal account user_id=${existingPasswordUser.id} require_group=${config.require_group} require_group_name=${config.require_group_name} GROUP_MATCH.`,
	);
	await internalUser.ssoAccess(existingPasswordUser.id, "sso-npm", auth, transaction);
	await transaction.commit();

	return existingPasswordUser;
};

const getExistingUsers = async (clientId, claims, transaction) => {
	const existingPasswordUser = userModel
		.query()
		.transacting(transaction)
		.select(["user.*"])
		.join("auth", "auth.user_id", "=", "user.id")
		.where("email", claims.email)
		.andWhere("user.is_deleted", 0)
		.andWhere("user.is_disabled", 0)
		.andWhere("auth.type", "password")
		.first();
	const existingEmailUser = userModel
		.query()
		.transacting(transaction)
		.select(["user.*", "a.*", "a.id AS auth_id", "user.id AS id"])
		.leftJoin("sso_auth AS a", "a.user_id", "=", "user.id")
		.where("email", claims.email)
		.andWhere("user.is_deleted", 0)
		.andWhere("user.is_disabled", 0)
		.first();
	const provisionedUser = userModel
		.query()
		.transacting(transaction)
		.select(["*", "a.id AS auth_id", "user.id AS id", "a.sso_client_id"])
		.join("sso_auth AS a", "a.user_id", "=", "user.id")
		.where("a.sso_client_id", clientId)
		.andWhere("a.subject", claims.sub)
		.andWhere("a.issuer", claims.iss)
		.andWhere("user.is_deleted", 0)
		.andWhere("a.auth_type", "sso-idp")
		.first();
	const disabledUser = userModel
		.query()
		.transacting(transaction)
		.where("email", claims.email)
		.andWhere("is_deleted", 0)
		.andWhere("is_disabled", 1)
		.first();

	return Promise.all([existingPasswordUser, existingEmailUser, provisionedUser, disabledUser]);
};

const redirectToAuthorizationURL = (res, params, clientId) => {
	const cleanURL = params.url ? String(params.url).replace(/(state|nonce)=([^&\n]+)/gi, "$1=***") : "";
	logger.info(`[${clientId}] Redirect: Authorization URL: ${cleanURL}`);
	res.cookie("npm_sso_s", params.state, { path: "/", secure: res.req.secure });
	res.cookie("npm_sso_n", params.code_verifier, { path: "/", secure: res.req.secure });
	res.redirect(String(params.url));
};

const redirectWithJwtToken = (res, token, clientId) => {
	logger.info(`[${clientId}] Redirect success: /sso/oauth2/success`);
	res.cookie("npm_sso_t", token.token, { path: "/", secure: res.req.secure });
	res.cookie("npm_sso_e", token.expires, { path: "/", secure: res.req.secure });
	res.redirect("/sso/oauth2/success");
};

const redirectWithError = (res, error, clientId) => {
	const message = error?.cause?.error_description || error?.message || "Unexpected error";
	logger.error(`[${clientId}] Redirect error: ${message}`);
	res.cookie("npm_sso_error", message);
	res.redirect("/login");
};

/**
 * Parses state and code_verifier from cookie during the callback phase.
 *
 * @param {Request} req
 * @return { {String}, {String} } state and nonce
 * */
const parseStateFromCookie = (req) => {
	let state;
	let code_verifier;
	const cookies = req.headers.cookie?.split?.(";") || [];
	for (const cookie of cookies) {
		const [key, val] = cookie.split("=");
		if (key.trim() === "npm_sso_s") {
			state = val.trim();
		}
		if (key.trim() === "npm_sso_n") {
			code_verifier = val.trim();
		}
		if (state && code_verifier) break;
	}

	return { state, code_verifier };
};

/**
 * Validates the SSO Client configuration and the authorized claims,
 * and determines if the user is allowed to proceed with login or sign up.
 *
 * @param {SingleSignOnClient} config
 * @param {Object} claims
 * @param {string} claims.sub
 * @param {string} claims.iss
 * @param {string} claims.email
 * @param {string[]} claims.groups
 * @param {string} claims.name
 * @param {string} claims.nickname
 * @param {string} claims.preferred_username
 * @param {string} claims.picture
 * @param {string} claims.profile_picture
 * @param {boolean} claims.email_verified
 * @returns Promise<any>
 */
const concludeAuthorized = async (config, claims) => {
	let user;
	let authType = "sso-idp";
	const errors = [];
	const transaction = await userModel.transaction();
	const users = await getExistingUsers(config.id, claims, transaction);

	try {
		user = await getProvisionedUser(config, claims, users, transaction);
	} catch (err) {
		errors.push(err.message);
	}

	if (!user) {
		try {
			user = await getInternalUser(config, claims, users, transaction);
			authType = "sso-npm";
		} catch (err) {
			errors.push(err.message);
		}
	}

	if (!user) {
		await transaction.rollback();
		throw new errs.AuthError(errors.join("; "));
	}

	logger.info(`[${config.id}] Successful authentication for email ${claims.email}`);

	return internalToken.getTokenForSingleSignOnUser(user, authType, claims.iss);
};

export {
	concludeAuthorized,
	parseStateFromCookie,
	redirectToAuthorizationURL,
	redirectWithError,
	redirectWithJwtToken,
};
