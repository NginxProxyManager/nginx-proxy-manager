import { generateToken, hashSecret, resources, tokenStatus } from "../lib/api-token-policy.js";
import { createStepUpLimiter } from "../lib/api-token-step-up.js";
import errs from "../lib/error.js";
import apiTokenModel from "../models/api_token.js";
import auditLogModel from "../models/audit-log.js";
import authModel from "../models/auth.js";
import userModel from "../models/user.js";
import twoFactor from "./2fa.js";

const verifyStepUp = createStepUpLimiter();
const publicToken = (row, user, auth) => ({
	status: tokenStatus(row, user, auth),
	id: row.id,
	name: row.name,
	scopes: row.scopes,
	visibility: row.visibility,
	created_on: row.created_on,
	expires_on: row.expires_on,
	revoked_on: row.revoked_on ?? null,
	last_used_on: row.last_used_on ?? null,
});
const sessionUser = async (access) => {
	if (access.credentialKind !== "jwt" || !access.token.hasScope("user")) throw new errs.PermissionError();
	const id = access.token.getUserId();
	await access.can("users:get", id);
	const user = await userModel
		.query()
		.findById(id)
		.where("is_deleted", 0)
		.where("is_disabled", 0)
		.withGraphFetched("permissions");
	if (!user) throw new errs.PermissionError();
	return user;
};
const optionsFor = (user, auth) => ({
	scopes: resources.flatMap((resource) => {
		const level = user.roles.includes("admin") ? "manage" : user.permissions?.[resource];
		if (level === "manage") return [`${resource}:read`, `${resource}:write`];
		return level === "view" ? [`${resource}:read`] : [];
	}),
	visibility: user.permissions?.visibility === "all" ? "all" : "user",
	requires_2fa: auth?.meta?.totp_enabled === true,
	max_expiry_days: 365,
	default_expiry_days: 30,
});
const authenticationFor = (id) => authModel.query().findOne({ user_id: id, type: "password" });
const internalApiToken = {
	options: async (access) => {
		const user = await sessionUser(access);
		return optionsFor(user, await authenticationFor(user.id));
	},
	getAll: async (access) => {
		const user = await sessionUser(access);
		const auth = await authenticationFor(user.id);
		const tokens = await apiTokenModel.query().where("owner_user_id", user.id).orderBy("id", "desc");
		return tokens.map((row) => publicToken(row, user, auth));
	},
	create: async (access, data) => {
		const days = data.expires_in_days ?? 30;
		if (
			!Number.isInteger(days) ||
			days < 1 ||
			days > 365 ||
			!Array.isArray(data.scopes) ||
			data.scopes.length < 1 ||
			data.scopes.length > 12 ||
			new Set(data.scopes).size !== data.scopes.length
		) {
			throw new errs.ValidationError("Invalid token scopes or expiry");
		}
		const user = await sessionUser(access);
		let auth;
		const valid = await verifyStepUp(user.id, async () => {
			auth = await authenticationFor(user.id);
			if (!auth || !(await auth.verifyPassword(data.password))) return false;
			return (
				!optionsFor(user, auth).requires_2fa ||
				!!(data.code && (await twoFactor.verifyForLogin(user.id, data.code)))
			);
		});
		if (!valid)
			throw Object.assign(new Error("Password or verification code is incorrect"), { status: 403, public: true });
		const options = optionsFor(user, auth);
		if (data.scopes.some((scope) => !options.scopes.includes(scope))) throw new errs.PermissionError();
		const credential = generateToken();
		const created = new Date();
		const row = await apiTokenModel.transaction(async (trx) => {
			const inserted = await apiTokenModel.query(trx).insertAndFetch({
				public_id: credential.publicId,
				owner_user_id: user.id,
				// Capture the version read BEFORE password/2FA verification. A disable
				// committed during verification invalidates even a later insertion.
				owner_version: user.api_token_version,
				name: data.name.trim(),
				secret_hash: credential.hash,
				scopes: data.scopes,
				visibility: options.visibility,
				created_on: created.toISOString(),
				expires_on: new Date(created.getTime() + days * 86400000).toISOString(),
				password_version: hashSecret(auth.secret),
			});
			await auditLogModel.query(trx).insert({
				user_id: user.id,
				action: "created",
				object_type: "api-token",
				object_id: inserted.id,
				meta: { name: inserted.name, scopes: inserted.scopes, expires_on: inserted.expires_on },
			});
			return inserted;
		});
		// Step-up may overlap a password reset or account disable. Keep the issued
		// version bound to the verified snapshot, but report current validity.
		const [currentUser, currentAuth] = await Promise.all([
			userModel.query().findById(user.id),
			authenticationFor(user.id),
		]);
		return { ...publicToken(row, currentUser, currentAuth), token: credential.token };
	},
	revoke: async (access, id) => {
		const user = await sessionUser(access);
		await apiTokenModel.transaction(async (trx) => {
			const row = await apiTokenModel.query(trx).findById(id).where("owner_user_id", user.id);
			if (!row) throw new errs.ItemNotFoundError(id);
			const updated = await apiTokenModel
				.query(trx)
				.where({ id, owner_user_id: user.id })
				.whereNull("revoked_on")
				.patch({ revoked_on: new Date().toISOString() });
			if (updated)
				await auditLogModel.query(trx).insert({
					user_id: user.id,
					action: "revoked",
					object_type: "api-token",
					object_id: id,
					meta: { name: row.name },
				});
		});
		return { revoked: true };
	},
};
export default internalApiToken;
