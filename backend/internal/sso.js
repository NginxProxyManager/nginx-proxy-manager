import { Issuer, generators } from "openid-client";
import errs from "../lib/error.js";
import internalToken from "./token.js";
import internalUser from "./user.js";
import userModel from "../models/user.js";
import userPermissionModel from "../models/user_permission.js";
import { debug, express as logger } from "../logger.js";

const getConfig = () => {
	const clientId = process.env.OIDC_CLIENT_ID;
	const clientSecret = process.env.OIDC_CLIENT_SECRET;
	const issuerUrl = process.env.OIDC_ISSUER_URL;
	const redirectUri = process.env.OIDC_REDIRECT_URI;
	const autoCreateUser = process.env.OIDC_AUTO_CREATE_USER !== "false";
	const groupsClaim = process.env.OIDC_GROUPS_CLAIM || "groups";
	const groupAdmin = process.env.OIDC_GROUP_ADMIN;
	const groupUser = process.env.OIDC_GROUP_USER;

	if (!clientId || !clientSecret || !issuerUrl || !redirectUri) {
		return null;
	}

	return {
		clientId,
		clientSecret,
		issuerUrl,
		redirectUri,
		autoCreateUser,
		groupsClaim,
		groupAdmin,
		groupUser,
	};
};

let _client = null;

const getClient = async () => {
	if (_client) return _client;
	const config = getConfig();
	if (!config) return null;

	try {
		const issuer = await Issuer.discover(config.issuerUrl);
		_client = new issuer.Client({
			client_id: config.clientId,
			client_secret: config.clientSecret,
			redirect_uris: [config.redirectUri],
			response_types: ["code"],
		});
		return _client;
	} catch (err) {
		logger.error("OIDC Discover failed: " + err.message);
		return null;
	}
};

export default {
	isConfigured: () => {
		return getConfig() !== null;
	},

	getAuthorizationUrl: async () => {
		const client = await getClient();
		if (!client) throw new Error("OIDC not configured");

		const state = generators.state();
		const nonce = generators.nonce();

		const url = client.authorizationUrl({
			scope: "openid email profile",
			state,
			nonce,
		});

		return { url, state, nonce };
	},

	handleCallback: async (reqUrl, state, nonce) => {
		const client = await getClient();
		if (!client) throw new Error("OIDC not configured");
		const config = getConfig();

		const params = client.callbackParams(reqUrl);
		const tokenSet = await client.callback(config.redirectUri, params, { state, nonce });

		const claims = tokenSet.claims();
		const email = claims.email || claims.preferred_username;

		if (!email) {
			throw new errs.AuthError("No email or preferred_username provided by OIDC");
		}

		let isAdmin = false;
		if (config.groupAdmin || config.groupUser) {
			const groups = claims[config.groupsClaim] || [];
			const groupsArr = Array.isArray(groups) ? groups : [groups];
			isAdmin = config.groupAdmin && groupsArr.includes(config.groupAdmin);
			const isUser = config.groupUser && groupsArr.includes(config.groupUser);

			if (!isAdmin && !isUser) {
				throw new errs.AuthError("User does not have access based on OIDC groups");
			}
		}

		// Find user
		let user = await userModel
			.query()
			.where("email", email.toLowerCase().trim())
			.andWhere("is_deleted", 0)
			.andWhere("is_disabled", 0)
			.first();

		if (!user) {
			if (!config.autoCreateUser) {
				throw new errs.AuthError("User does not exist and auto-create is disabled");
			}

			// auto create user
			const mockAccess = {
				can: async () => true, // bypass permission checks for internal creation
				token: {
					getUserId: () => 0,
					hasScope: () => true
				}
			};
			user = await internalUser.create(mockAccess, {
				name: claims.name || claims.given_name || email,
				nickname: claims.nickname || email.split("@")[0],
				email: email,
				roles: isAdmin ? ["admin"] : [],
				is_disabled: 0,
			});
		} else {
			// Sync roles if RBAC is enabled
			if (config.groupAdmin || config.groupUser) {
				const currentIsAdmin = user.roles && user.roles.includes("admin");
				if (currentIsAdmin !== isAdmin) {
					user = await userModel.query().patchAndFetchById(user.id, {
						roles: isAdmin ? ["admin"] : []
					});
					
					const existingPerms = await userPermissionModel.query().where("user_id", user.id).first();
					if (existingPerms) {
						await userPermissionModel.query().patchAndFetchById(existingPerms.id, {
							visibility: isAdmin ? "all" : "user"
						});
					} else {
						await userPermissionModel.query().insert({
							user_id: user.id,
							visibility: isAdmin ? "all" : "user",
							proxy_hosts: "manage",
							redirection_hosts: "manage",
							dead_hosts: "manage",
							streams: "manage",
							access_lists: "manage",
							certificates: "manage",
						});
					}
				}
			}
		}

		// Generate token
		const tokenInfo = await internalToken.getTokenFromUser(user);
		return tokenInfo;
	},
};
