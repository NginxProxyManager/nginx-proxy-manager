import dnsPlugins from "../certbot/dns-plugins.json" with { type: "json" };
import errs from "../lib/error.js";
import { validateDnsCredentialsFormat } from "../lib/secrets/resolve.js";
import {
	deleteCredentialFile,
	readCredentialFile,
	STORAGE_PATH_PLACEHOLDER,
	writeCredentialFile,
} from "../lib/secrets/storage.js";
import utils from "../lib/utils.js";
import certificateModel from "../models/certificate.js";
import credentialModel from "../models/credential.js";
import internalAuditLog from "./audit-log.js";

const omissions = () => ["is_deleted", "storage_path", "encryption_key_id"];

const internalCredential = {
	create: async (access, data) => {
		await access.can("credentials:create", data);
		validateDnsCredentialsFormat(data.dns_provider, data.credentials);

		const row = await credentialModel.query().insertAndFetch({
			name: data.name,
			dns_provider: data.dns_provider,
			owner_user_id: access.token.getUserId(1),
			storage_path: STORAGE_PATH_PLACEHOLDER,
			encryption_key_id: "v1",
		});

		const { storagePath, keyId } = writeCredentialFile(row.id, data.credentials);
		const saved = await credentialModel
			.query()
			.patchAndFetchById(row.id, {
				storage_path: storagePath,
				encryption_key_id: keyId,
			})
			.then(utils.omitRow(omissions()));

		await internalAuditLog.add(access, {
			action: "created",
			object_type: "credential",
			object_id: saved.id,
			meta: { name: saved.name, dns_provider: saved.dns_provider },
		});

		return saved;
	},

	update: async (access, data) => {
		await access.can("credentials:update", data.id);
		const row = await internalCredential.get(access, { id: data.id });

		const patch = {};
		if (typeof data.name !== "undefined") {
			patch.name = data.name;
		}
		if (typeof data.dns_provider !== "undefined") {
			patch.dns_provider = data.dns_provider;
		}

		if (typeof data.credentials !== "undefined") {
			const provider = data.dns_provider || row.dns_provider;
			validateDnsCredentialsFormat(provider, data.credentials);
			const { storagePath, keyId } = writeCredentialFile(row.id, data.credentials);
			patch.storage_path = storagePath;
			patch.encryption_key_id = keyId;
		}

		const saved = await credentialModel.query().patchAndFetchById(row.id, patch).then(utils.omitRow(omissions()));

		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "credential",
			object_id: saved.id,
			meta: { name: saved.name, dns_provider: saved.dns_provider },
		});

		return saved;
	},

	get: async (access, data) => {
		await access.can("credentials:get", data.id);
		const row = await credentialModel
			.query()
			.where("id", data.id)
			.andWhere("is_deleted", 0)
			.first()
			.then(utils.omitRow(omissions()));

		if (!row) {
			throw new errs.ItemNotFoundError(data.id);
		}
		return row;
	},

	getAll: async (access) => {
		await access.can("credentials:list");
		return credentialModel
			.query()
			.where("is_deleted", 0)
			.orderBy("name", "ASC")
			.then(utils.omitRows(omissions()));
	},

	delete: async (access, data) => {
		await access.can("credentials:delete", data.id);
		const row = await internalCredential.get(access, { id: data.id });

		await credentialModel.query().patchAndFetchById(row.id, { is_deleted: 1 });
		deleteCredentialFile(row.id);

		await internalAuditLog.add(access, {
			action: "deleted",
			object_type: "credential",
			object_id: row.id,
			meta: { name: row.name, dns_provider: row.dns_provider },
		});

		return true;
	},

	test: async (access, data) => {
		await access.can("credentials:get", data.id);
		const row = await credentialModel
			.query()
			.where("id", data.id)
			.andWhere("is_deleted", 0)
			.first();

		if (!row) {
			throw new errs.ItemNotFoundError(data.id);
		}

		readCredentialFile(row.id);
		const plugin = dnsPlugins[row.dns_provider];
		return {
			ok: true,
			dns_provider: row.dns_provider,
			plugin_name: plugin?.name || row.dns_provider,
		};
	},

	/**
	 * Import plaintext DNS credentials from certificate.meta into the vault.
	 * @param {Access} access
	 * @param {Object} [data]
	 * @param {boolean} [data.dry_run]
	 */
	migrateLegacy: async (access, data = {}) => {
		await access.can("credentials:create", {});

		const certs = await certificateModel
			.query()
			.where("is_deleted", 0)
			.andWhere("provider", "letsencrypt");

		const results = [];
		for (const cert of certs) {
			const meta = cert.meta || {};
			if (!meta.dns_challenge || typeof meta.dns_provider_credentials !== "string") {
				continue;
			}
			if (meta.credential_ref?.type) {
				continue;
			}

			const entry = {
				certificate_id: cert.id,
				domain_names: cert.domain_names,
				dns_provider: meta.dns_provider,
				status: "skipped",
			};

			if (!data.dry_run) {
				const cred = await internalCredential.create(access, {
					name: `Migrated cert #${cert.id}`,
					dns_provider: meta.dns_provider,
					credentials: meta.dns_provider_credentials,
				});

				const newMeta = {
					...meta,
					credential_ref: { type: "internal", id: cred.id },
				};
				delete newMeta.dns_provider_credentials;

				await certificateModel.query().patchAndFetchById(cert.id, { meta: newMeta });
				entry.credential_id = cred.id;
				entry.status = "migrated";
			} else {
				entry.status = "would_migrate";
			}

			results.push(entry);
		}

		return {
			dry_run: !!data.dry_run,
			count: results.length,
			results,
		};
	},
};

export default internalCredential;
