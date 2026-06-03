import errs from "../lib/error.js";
import { getProviderAccessToken, loadProvider, resolveFromProvider } from "../lib/secrets/resolvers/index.js";
import {
	deleteProviderSecret,
	readProviderSecret,
	writeProviderSecret,
} from "../lib/secrets/provider-storage.js";
import { STORAGE_PATH_PLACEHOLDER } from "../lib/secrets/storage.js";
import utils from "../lib/utils.js";
import credentialProviderModel from "../models/credential_provider.js";
import internalAuditLog from "./audit-log.js";

const omissions = () => ["is_deleted", "oidc_client_secret_path"];

const PROVIDER_TYPES = ["vault", "aws", "azure", "infisical", "http"];

const internalCredentialProvider = {
	create: async (access, data) => {
		await access.can("credential_providers:create", data);

		if (!PROVIDER_TYPES.includes(data.type)) {
			throw new errs.ValidationError(`Invalid provider type. Must be one of: ${PROVIDER_TYPES.join(", ")}`);
		}

		const row = await credentialProviderModel.query().insertAndFetch({
			name: data.name,
			type: data.type,
			owner_user_id: access.token.getUserId(1),
			oidc_issuer: data.oidc_issuer || null,
			oidc_client_id: data.oidc_client_id || null,
			oidc_audience: data.oidc_audience || null,
			oidc_scope: data.oidc_scope || null,
			oidc_client_secret_path: STORAGE_PATH_PLACEHOLDER,
			meta: data.meta || {},
		});

		if (data.oidc_client_secret) {
			const secretPath = writeProviderSecret(row.id, data.oidc_client_secret);
			await credentialProviderModel.query().patchAndFetchById(row.id, {
				oidc_client_secret_path: secretPath,
			});
		}

		const saved = await internalCredentialProvider.get(access, { id: row.id });

		await internalAuditLog.add(access, {
			action: "created",
			object_type: "credential-provider",
			object_id: saved.id,
			meta: { name: saved.name, type: saved.type },
		});

		return saved;
	},

	update: async (access, data) => {
		await access.can("credential_providers:update", data.id);
		const row = await loadProvider(data.id);

		const patch = {};
		if (typeof data.name !== "undefined") patch.name = data.name;
		if (typeof data.oidc_issuer !== "undefined") patch.oidc_issuer = data.oidc_issuer;
		if (typeof data.oidc_client_id !== "undefined") patch.oidc_client_id = data.oidc_client_id;
		if (typeof data.oidc_audience !== "undefined") patch.oidc_audience = data.oidc_audience;
		if (typeof data.oidc_scope !== "undefined") patch.oidc_scope = data.oidc_scope;
		if (typeof data.meta !== "undefined") patch.meta = data.meta;

		if (typeof data.oidc_client_secret !== "undefined" && data.oidc_client_secret) {
			const secretPath = writeProviderSecret(row.id, data.oidc_client_secret);
			patch.oidc_client_secret_path = secretPath;
		}

		await credentialProviderModel.query().patchAndFetchById(row.id, patch);
		return internalCredentialProvider.get(access, { id: row.id });
	},

	get: async (access, data) => {
		await access.can("credential_providers:get", data.id);
		const row = await credentialProviderModel
			.query()
			.where("id", data.id)
			.andWhere("is_deleted", 0)
			.first()
			.then(utils.omitRow(omissions()));

		if (!row) {
			throw new errs.ItemNotFoundError(data.id);
		}
		row.has_oidc_secret = !!readProviderSecret(row.id);
		return row;
	},

	getAll: async (access) => {
		await access.can("credential_providers:list");
		const rows = await credentialProviderModel
			.query()
			.where("is_deleted", 0)
			.orderBy("name", "ASC")
			.then(utils.omitRows(omissions()));

		return rows.map((row) => ({
			...row,
			has_oidc_secret: !!readProviderSecret(row.id),
		}));
	},

	delete: async (access, data) => {
		await access.can("credential_providers:delete", data.id);
		const row = await loadProvider(data.id);
		await credentialProviderModel.query().patchAndFetchById(row.id, { is_deleted: 1 });
		deleteProviderSecret(row.id);
		return true;
	},

	test: async (access, data) => {
		await access.can("credential_providers:get", data.id);
		const provider = await loadProvider(data.id);
		await getProviderAccessToken(provider);
		return { ok: true, type: provider.type, name: provider.name };
	},

	testResolve: async (access, data) => {
		await access.can("credential_providers:get", data.id);
		const provider = await loadProvider(data.id);
		const ini = await resolveFromProvider(provider, {
			path: data.path,
			field: data.field,
		});
		return { ok: true, bytes: ini.length };
	},
};

export default internalCredentialProvider;
