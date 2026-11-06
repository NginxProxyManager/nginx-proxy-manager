import internalToken from "../../internal/token.js";
import internalUser from "../../internal/user.js";
import { sso as logger } from "../../logger.js";
import now_helper from "../../models/now_helper.js";
import userModel from "../../models/user.js";
import errs from "../error.js";

export const LOCALSTORAGE_RETURN_URI_KEY = "returnTo";
export const LOCALSTORAGE_AUTH_TYPE_KEY = "authType";

const getProvisionedUser = async (config, claims, users) => {
	const groups = claims.groups;
	const [existingPasswordUser, existingEmailUser, provisionedUser, disabledUser] = users;
	const emptyRoleMap = !config.meta.role_map || config.meta.role_map.length === 0;
	const ownerUserId = config.owner_user_id;

	const newUserData = {
		roles: [],
		email: claims.email,
		name: claims.name || claims.given_name || claims.nickname,
		nickname: claims.nickname || claims.preferred_username,
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

	// Direct match to provisioned user by claims.sub with existing 'sso-idp' auth, log in to this account
	if (provisionedUser && provisionedUser.sso_client_id === config.id) {
		logger.info(`[${config.id}] Logging in to existing provisioned account user_id=${provisionedUser.id}`);
		await internalUser.ssoAccess(provisionedUser.id, "sso-idp", authData);

		return provisionedUser;
	}

	if (!config.provision_users) {
		throw new Error("sso.error.signup.not-permitted");
	}

	// Reject provision with an email address for existing disabled user
	if (disabledUser) {
		throw new Error("sso.error.not-permitted");
	}

	// Reject provision with an email address for an existing internal user
	if (existingPasswordUser) {
		throw new Error("sso.error.signup.not-permitted-2");
	}

	// Reject provision with existing email (enforce unique)
	if (existingEmailUser && (existingEmailUser.subject !== claims.sub || existingEmailUser.issuer !== claims.iss)) {
		throw new Error("sso.error.signup.unique-email");
	}

	// Reject provision unverified email when required by setting
	if (config.require_verified_email && claims.email_verified !== true) {
		throw new Error("sso.error.signup.verified-email");
	}

	const provisionArgs = [newUserData, authData, ownerUserId, provisionedUser];

	// Provision to user role when no group membership is required
	if (!config.require_provision_group) {
		const [newUser, existingUser] = await internalUser.provision(...provisionArgs);
		const userId = (newUser || existingUser).id;
		const action = `NO_GROUP_${newUser ? "PUSER" : "PAUTH"}`;
		logger.info(
			`[${config.id}] Provisioned new account user_id=${userId} require_provision_group=${config.require_provision_group} ${action} user`,
		);

		return newUser || existingUser;
	}

	// Sanity check
	if (config.require_provision_group && !config.require_provision_group_name && emptyRoleMap) {
		throw new Error("sso.error.config.group-required");
	}

	// All check from here on require the groups claim.
	if (!groups || !Array.isArray(groups) || !groups.length) {
		throw new Error("sso.error.no-groups-claim-2");
	}

	// Provisioin to user role if group membership satisfies (no role mapping)
	if (config.require_provision_group && config.require_provision_group_name && emptyRoleMap) {
		if (!groups.includes(config.require_provision_group_name)) {
			throw new Error("sso.error.signup.group-required");
		}

		const [newUser, existingUser] = await internalUser.provision(...provisionArgs);
		const userId = (newUser || existingUser).id;
		const action = `GROUP_MATCH_${newUser ? "PUSER" : "PAUTH"}`;
		logger.info(
			`[${config.id}] Provisioned new account user_id=${userId} require_provision_group=${config.require_provision_group} require_provision_group_name=${config.require_provision_group_name} ${action} user`,
		);

		return newUser || existingUser;
	}

	// Provision accoring to mapped role if group membership satisfies.
	if (config.require_provision_group && !config.require_provision_group_name && !emptyRoleMap) {
		let role;
		config.meta.role_map.forEach((map) => {
			if (groups.includes(map.group)) {
				role = role === "admin" ? role : map.role;
			}
		});

		if (!role) {
			throw new Error("sso.error.signup.group-required-2");
		}

		newUserData.roles = role === "admin" ? [role] : [];
		const [newUser, existingUser] = await internalUser.provision(...provisionArgs);
		const userId = (newUser || existingUser).id;
		const action = `MAPPED_TO_ROLE_${newUser ? "PUSER" : "PAUTH"}`;
		logger.info(
			`[${config.id}] Provisioned account user_id=${userId} require_provision_group=${config.require_provision_group} ${action} ${role}`,
		);

		return newUser || existingUser;
	}

	// Provision to mapped role if both group memberships satisfy.
	if (config.require_provision_group && config.require_provision_group_name && !emptyRoleMap) {
		if (!groups.includes(config.require_provision_group_name)) {
			throw new Error("sso.error.signup.group-required-3");
		}

		let role;
		config.meta.role_map.forEach((map) => {
			if (groups.includes(map.group)) {
				role = role === "admin" ? role : map.role;
			}
		});

		if (!role) {
			throw new Error("sso.error.signup.group-required-3");
		}

		newUserData.roles = role === "admin" ? [role] : [];
		const [newUser, existingUser] = await internalUser.provision(...provisionArgs);
		const userId = (newUser || existingUser).id;
		const action = `GROUP_MATCH_MAPPED_TO_ROLE_${newUser ? "PUSER" : "PAUTH"}`;
		logger.info(
			`[${config.id}] Provisioned account user_id=${userId} require_provision_group=${config.require_provision_group} require_provision_group_name=${config.require_provision_group_name} ${action} ${role}`,
		);

		return newUser || existingUser;
	}
};

const getInternalUser = async (config, claims, users) => {
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

	if (config.require_verified_email && claims.email_verified !== true) {
		throw new Error("sso.error.login.verified-email");
	}

	if (config.allow_internal_if_admin && !existingPasswordUser.roles?.includes("admin")) {
		throw new Error("sso.error.login.not-permitted-2");
	}

	if (!config.require_group) {
		logger.info(
			`[${config.id}] Logging in to existing internal account user_id=${existingPasswordUser.id} NO_GROUP`,
		);
		await internalUser.ssoAccess(existingPasswordUser.id, "sso-npm", auth);

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
	await internalUser.ssoAccess(existingPasswordUser.id, "sso-npm", auth);

	return existingPasswordUser;
};

const getExistingUsers = async (claims) => {
	const existingPasswordUser = userModel
		.query()
		.join("auth", "auth.user_id", "=", "user.id")
		.where("email", claims.email)
		.andWhere("user.is_deleted", 0)
		.andWhere("user.is_disabled", 0)
		.andWhere("auth.type", "password")
		.first();
	const existingEmailUser = userModel
		.query()
		.where("email", claims.email)
		.andWhere("user.is_deleted", 0)
		.andWhere("user.is_disabled", 0)
		.first();
	const provisionedUser = userModel
		.query()
		.select(["*", "a.id AS auth_id", "user.id AS id", "a.sso_client_id"])
		.join("sso_auth AS a", "a.user_id", "=", "user.id")
		.where("a.subject", claims.sub)
		.andWhere("a.issuer", claims.iss)
		.andWhere("user.is_deleted", 0)
		.andWhere("user.is_disabled", 0)
		.andWhere("a.auth_type", "sso-idp")
		.first();
	const disabledUser = userModel
		.query()
		.where("email", claims.email)
		.andWhere("is_deleted", 0)
		.andWhere("is_disabled", 1)
		.first();

	return Promise.all([existingPasswordUser, existingEmailUser, provisionedUser, disabledUser]);
};

const redirectToAuthorizationURL = (res, params) => {
	const cleanURL = params.url ? String(params.url).replace(/(state|nonce)=([^&\n]+)/gi, "$1=***") : "";
	logger.info(`[${res.req.params.client_id}] Redirect: Authorization URL: ${cleanURL}`);
	res.cookie("npm_sso_s", params.state);
	res.cookie("npm_sso_n", params.code_verifier);
	res.redirect(String(params.url));
};

const redirectWithJwtToken = (res, token) => {
	logger.info(`[${res.req.params.client_id}] Redirect success: /sso/oauth2/success`);
	res.cookie("npm_sso_t", token.token);
	res.cookie("npm_sso_e", token.expires);
	res.redirect("/sso/oauth2/success");
};

const redirectWithError = (res, error) => {
	const message = error?.cause?.error_description || error?.message || "Unexpected error";
	logger.error(`[${res.req.params.client_id}] Redirect error: ${message}`);
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
 * @param {Object} config
 * @param {Object} claims
 * @returns Promise<any>
 */
const concludeAuthorized = async (config, claims) => {
	let user;
	let authType = "sso-idp";
	const errors = [];
	const users = await getExistingUsers(claims);
	try {
		user = await getProvisionedUser(config, claims, users);
	} catch (err) {
		errors.push(err.message);
	}

	if (!user) {
		try {
			user = await getInternalUser(config, claims, users);
			authType = "sso-npm";
		} catch (err) {
			errors.push(err.message);
		}
	}

	if (!user) {
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
