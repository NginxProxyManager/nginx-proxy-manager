import { randomUUID } from "node:crypto";
import authModel from "../models/auth.js";
import userModel from "../models/user.js";
import userPermissionModel from "../models/user_permission.js";

const DEFAULT_ADMIN_PROFILE = {
	is_deleted: 0,
	is_disabled: 0,
	name: "Administrator",
	nickname: "Admin",
	avatar: "",
	roles: ["admin"],
};

const DEFAULT_ADMIN_PERMISSIONS = {
	visibility: "all",
	proxy_hosts: "manage",
	redirection_hosts: "manage",
	dead_hosts: "manage",
	streams: "manage",
	access_lists: "manage",
	certificates: "manage",
};

/**
 * @param {string} email
 * @param {{name?: string, nickname?: string, avatar?: string}} [overrides]
 * @returns {Object}
 */
const buildDefaultAdminUserData = (email, overrides = {}) => {
	return {
		...DEFAULT_ADMIN_PROFILE,
		email,
		...overrides,
	};
};

/**
 * @param {number} userId
 * @returns {Object}
 */
const buildDefaultAdminPermissions = (userId) => {
	return {
		user_id: userId,
		...DEFAULT_ADMIN_PERMISSIONS,
	};
};

/**
 * @param {Object} data
 * @param {string} data.email
 * @param {string} [data.password]
 * @param {string} [data.authType]
 * @param {string} [data.authSecret]
 * @param {Object} [data.authMeta]
 * @param {Object} [data.userOverrides]
 * @returns {Promise<Object>}
 */
const createDefaultAdminUser = async ({
	email,
	password,
	authType = "password",
	authSecret,
	authMeta = {},
	userOverrides = {},
}) => {
	const userData = buildDefaultAdminUserData(email, userOverrides);
	const user = await userModel.query().insertAndFetch(userData);

	const secret =
		typeof authSecret === "string"
			? authSecret
			: typeof password === "string"
				? password
				: randomUUID();

	await authModel.query().insert({
		user_id: user.id,
		type: authType,
		secret,
		meta: authMeta,
	});

	await userPermissionModel.query().insert(buildDefaultAdminPermissions(user.id));

	return user;
};

export {
	buildDefaultAdminPermissions,
	buildDefaultAdminUserData,
	createDefaultAdminUser,
};

