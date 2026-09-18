import db from "../db.js";
import { getPrivateKey } from "../lib/config.js";
import { seal, unseal, validateConfig, discover, random, identityKey } from "../lib/oidc.js";
import errs from "../lib/error.js";
import userModel from "../models/user.js";
import authModel from "../models/auth.js";
import TokenModel from "../models/token.js";
import internalToken from "./token.js";
import crypto from "node:crypto";
const authStamp = (auth) =>
	crypto
		.createHash("sha256")
		.update(
			JSON.stringify([
				auth?.secret,
				auth?.meta?.password_changed_at,
				auth?.meta?.totp_enabled,
				auth?.meta?.totp_secret,
				auth?.meta?.totp_enabled_at,
			]),
		)
		.digest("hex");

const defaults = {
	enabled: false,
	auto_login: false,
	issuer: "",
	public_url: "",
	client_id: "",
	client_secret: "",
	scopes: "openid",
	token_auth_method: "auto",
};

export async function readConfig() {
	const row = await db()("oidc_config").where({ id: 1 }).first();
	if (!row) return { config: { ...defaults }, revision: "initial" };
	const config = { ...defaults, ...JSON.parse(row.config) };
	config.client_secret = config.client_secret ? unseal(config.client_secret, getPrivateKey()) : "";
	return { config, revision: row.revision };
}
export function publicConfig({ config, revision }) {
	const { client_secret, ...safe } = config;
	return {
		...safe,
		revision,
		client_secret_configured: !!client_secret,
		callback_url: config.public_url ? new URL("/api/oidc/callback", config.public_url).href : "",
	};
}
export async function saveConfig(access, input) {
	await access.can("settings:update", "oidc");
	const previous = await readConfig();
	if (input.revision !== previous.revision) throw new errs.ValidationError("OIDC settings changed; reload and retry");
	const config = { ...previous.config };
	for (const key of ["issuer", "client_id", "public_url", "scopes"]) {
		if (typeof input[key] !== "string" || input[key].length > 2048)
			throw new errs.ValidationError("Invalid OIDC field");
		config[key] = input[key].trim();
	}
	config.scopes = config.scopes.split(/\s+/).filter(Boolean).join(" ");
	if (input.token_auth_method !== undefined) config.token_auth_method = input.token_auth_method;
	for (const key of ["enabled", "auto_login"]) {
		if (typeof input[key] !== "boolean") throw new errs.ValidationError("Invalid OIDC switch");
		config[key] = input[key];
	}
	if (typeof input.client_secret !== "string" || input.client_secret.length > 8192)
		throw new errs.ValidationError("Invalid client secret");
	if (input.client_secret) config.client_secret = input.client_secret;
	try {
		validateConfig(config);
	} catch (error) {
		throw new errs.ValidationError(error.message);
	}
	const revision = random();
	if (config.enabled) {
		try {
			await discover(config, revision);
		} catch {
			throw new errs.ValidationError("Unable to discover OIDC provider over HTTPS");
		}
	}
	const stored = {
		...config,
		client_secret: config.client_secret ? seal(config.client_secret, getPrivateKey()) : "",
	};
	await db().transaction(async (trx) => {
		const row = await trx("oidc_config").where({ id: 1 }).first();
		if ((row?.revision || "initial") !== previous.revision)
			throw new errs.ValidationError("OIDC settings changed; reload and retry");
		if (row) {
			const n = await trx("oidc_config")
				.where({ id: 1, revision: previous.revision })
				.update({ config: JSON.stringify(stored), revision });
			if (n !== 1) throw new errs.ValidationError("OIDC settings changed; retry");
		} else await trx("oidc_config").insert({ id: 1, config: JSON.stringify(stored), revision });
	});
	return publicConfig({ config, revision });
}
export async function activeUser(id) {
	const user = await userModel.query().where({ id, is_deleted: 0, is_disabled: 0 }).first();
	if (!user) throw new errs.AuthError("Account is unavailable");
	return user;
}
export async function authenticationStamp(id) {
	await activeUser(id);
	const auth = await authModel.query().where({ user_id: id, type: "password", is_deleted: 0 }).first();
	return authStamp(auth);
}
export async function linkIdentity(id, issuer, subject, stamp) {
	await activeUser(id);
	await db().transaction(async (trx) => {
		const auth = await authModel
			.query(trx)
			.where({ user_id: id, type: "password", is_deleted: 0 })
			.forUpdate()
			.first();
		if (authStamp(auth) !== stamp) throw new errs.AuthError("Local authentication changed; start linking again");
		const user = await userModel.query(trx).where({ id, is_deleted: 0, is_disabled: 0 }).first();
		if (!user) throw new errs.AuthError("Account is unavailable");
		const current = await trx("oidc_identity").where({ user_id: id }).first();
		if (current) throw new errs.ValidationError("An OIDC identity is already linked");
		await trx("oidc_identity").insert({ user_id: id, identity_key: identityKey(issuer, subject), issuer, subject });
	});
}
export async function linkedUser(issuer, subject) {
	const row = await db()("oidc_identity")
		.where({ identity_key: identityKey(issuer, subject) })
		.first();
	if (!row || row.issuer !== issuer || row.subject !== subject)
		throw new errs.AuthError("Identity is not linked to an NPM account");
	return activeUser(row.user_id);
}
export async function loginResult(user) {
	await activeUser(user.id);
	const auth = await authModel.query().where({ user_id: user.id, type: "password", is_deleted: 0 }).first();
	if (auth?.meta?.totp_enabled === true) {
		const signed = await TokenModel().create({
			iss: "api",
			attrs: { id: user.id },
			scope: ["2fa-challenge"],
			expiresIn: "5m",
		});
		return { requires_2fa: true, challenge_token: signed.token };
	}
	const result = await internalToken.getTokenFromUser(user);
	return { token: result.token, expires: result.expires };
}
