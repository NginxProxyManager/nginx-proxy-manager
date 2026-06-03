import crypto from "node:crypto";
import bcrypt from "bcrypt";
import apiKeyModel from "../models/api_key.js";
import now from "../models/now_helper.js";
import errs from "../lib/error.js";
import utils from "../lib/utils.js";
import internalAuditLog from "./audit-log.js";

const omissions = () => ["is_deleted", "key_hash", "key_prefix"];

const hashApiKey = (rawKey) => bcrypt.hash(rawKey, 13);
const verifyApiKey = (rawKey, hash) => bcrypt.compare(rawKey, hash);

const internalApiKey = {
	create: async (access, data) => {
		await access.can("api_keys:create", data);

		const prefix = crypto.randomBytes(4).toString("hex");
		const secret = crypto.randomBytes(24).toString("base64url");
		const rawKey = `npmak_${prefix}_${secret}`;
		const keyHash = await hashApiKey(rawKey);

		const row = await apiKeyModel.query().insertAndFetch({
			name: data.name,
			key_prefix: prefix,
			key_hash: keyHash,
			owner_user_id: access.token.getUserId(1),
			permissions: data.permissions || {},
			expires_on: data.expires_on || null,
		});

		const result = utils.omitRow(omissions())(row);
		result.key = rawKey;

		await internalAuditLog.add(access, {
			action: "created",
			object_type: "api-key",
			object_id: row.id,
			meta: { name: row.name },
		});

		return result;
	},

	getAll: async (access) => {
		await access.can("api_keys:list");
		return apiKeyModel
			.query()
			.where("is_deleted", 0)
			.orderBy("name", "ASC")
			.then(utils.omitRows(omissions()));
	},

	delete: async (access, data) => {
		await access.can("api_keys:delete", data.id);
		const row = await apiKeyModel
			.query()
			.where("id", data.id)
			.andWhere("is_deleted", 0)
			.first();

		if (!row) {
			throw new errs.ItemNotFoundError(data.id);
		}

		await apiKeyModel.query().patchAndFetchById(row.id, { is_revoked: 1, is_deleted: 1 });

		await internalAuditLog.add(access, {
			action: "deleted",
			object_type: "api-key",
			object_id: row.id,
			meta: { name: row.name },
		});

		return true;
	},

	/**
	 * @param {string} rawKey
	 */
	authenticate: async (rawKey) => {
		if (!rawKey?.startsWith("npmak_")) {
			throw new errs.AuthError("Invalid API key");
		}

		const parts = rawKey.split("_");
		if (parts.length < 3) {
			throw new errs.AuthError("Invalid API key");
		}

		const prefix = parts[1];
		const row = await apiKeyModel
			.query()
			.where("key_prefix", prefix)
			.andWhere("is_deleted", 0)
			.andWhere("is_revoked", 0)
			.first();

		if (!row) {
			throw new errs.AuthError("Invalid API key");
		}

		if (row.expires_on && new Date(row.expires_on) < new Date()) {
			throw new errs.AuthError("API key expired");
		}

		const valid = await verifyApiKey(rawKey, row.key_hash);
		if (!valid) {
			throw new errs.AuthError("Invalid API key");
		}

		await apiKeyModel.query().patchAndFetchById(row.id, {
			last_used_at: now(),
		});

		return row;
	},
};

export default internalApiKey;
