import { randomUUID } from "node:crypto";
import errs from "../lib/error.js";
import { createDefaultAdminUser } from "../lib/default-user.js";
import { getOIDCConfig } from "../lib/oidc.js";
import authModel from "../models/auth.js";
import userModel from "../models/user.js";
import userPermissionModel from "../models/user_permission.js";
import { isSetup } from "../setup.js";
import internalToken from "./token.js";

const findUserByEmail = async (email) => {
	return userModel
		.query()
		.where("email", email.toLowerCase().trim())
		.andWhere("is_deleted", 0)
		.andWhere("is_disabled", 0)
		.first();
};

const createStandardOidcUser = async ({ email, profile, subject }) => {
	const name = profile.name || email;
	const nickname = profile.preferred_username || profile.nickname || email.split("@")[0];

	const user = await userModel.query().insertAndFetch({
		is_deleted: 0,
		is_disabled: 0,
		email,
		name,
		nickname,
		avatar: "",
		roles: [],
	});

	await authModel.query().insert({
		user_id: user.id,
		type: "oidc",
		secret: randomUUID(),
		meta: {
			sub: subject,
		},
	});

	await userPermissionModel.query().insert({
		user_id: user.id,
		visibility: "user",
		proxy_hosts: "manage",
		redirection_hosts: "manage",
		dead_hosts: "manage",
		streams: "manage",
		access_lists: "manage",
		certificates: "manage",
	});

	return user;
};

const ensureOidcAuthMapping = async ({ userId, subject }) => {
	if (!subject) {
		return;
	}

	const existing = await authModel
		.query()
		.where("user_id", userId)
		.where("type", "oidc")
		.first();

	if (existing) {
		if (existing.meta?.sub !== subject) {
			await authModel
				.query()
				.patch({
					meta: {
						...(existing.meta || {}),
						sub: subject,
					},
				})
				.where("id", existing.id);
		}
		return;
	}

	await authModel.query().insert({
		user_id: userId,
		type: "oidc",
		secret: randomUUID(),
		meta: {
			sub: subject,
		},
	});
};

const getIdentityFromUserInfo = (userinfo) => {
	const config = getOIDCConfig();
	const identifier = userinfo?.[config.identifierField] || userinfo?.email;

	if (!identifier || typeof identifier !== "string") {
		throw new errs.AuthError("OIDC profile is missing the configured identifier");
	}

	return identifier.toLowerCase().trim();
};

const resolveUser = async (userinfo) => {
	const email = getIdentityFromUserInfo(userinfo);
	let user = await findUserByEmail(email);

	if (user) {
		await ensureOidcAuthMapping({ userId: user.id, subject: userinfo.sub });
		return user;
	}

	const setup = await isSetup();
	if (!setup) {
		return createDefaultAdminUser({
			email,
			authType: "oidc",
			authMeta: {
				sub: userinfo.sub,
			},
			userOverrides: {
				name: userinfo.name || "Administrator",
				nickname: userinfo.preferred_username || "Admin",
			},
		});
	}

	const config = getOIDCConfig();
	if (!config.autoCreateUser) {
		throw new errs.AuthError("No account exists for this OIDC user");
	}

	user = await createStandardOidcUser({
		email,
		profile: userinfo,
		subject: userinfo.sub,
	});

	return user;
};

const authenticateFromUserInfo = async (userinfo) => {
	const user = await resolveUser(userinfo);
	const token = await internalToken.getTokenFromUser(user);
	return {
		...token,
		auth_method: "oidc",
	};
};

export default {
	authenticateFromUserInfo,
};

