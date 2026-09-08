import { normalizeMeta, PROVIDER_TYPES, redactProvider, SECRET_FIELDS } from "../lib/auth/definitions.js";
import * as ldap from "../lib/auth/ldap.js";
import {
	ensureAWayBackIn,
	isLocalAuthEnabled,
	LOCAL_AUTH_SETTING,
	localAuthDisabledByEnv,
} from "../lib/auth/local-auth.js";
import * as oauth from "../lib/auth/oauth.js";
import { detachProviderUsers, resolveUser } from "../lib/auth/provision.js";
import * as saml from "../lib/auth/saml.js";
import * as sync from "../lib/auth/sync.js";
import errs from "../lib/error.js";
import { auth as logger } from "../logger.js";
import authModel from "../models/auth.js";
import authProviderModel from "../models/auth_provider.js";
import settingModel from "../models/setting.js";
import userModel from "../models/user.js";
import internalAuditLog from "./audit-log.js";

/**
 * Turns a display name into a slug that's unique among providers.
 *
 * @param   {String}  name
 * @param   {Integer} [ignoreId]
 * @returns {Promise<String>}
 */
const generateSlug = async (name, ignoreId) => {
	const base =
		String(name || "provider")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 80) || "provider";

	for (let suffix = 0; suffix < 100; suffix++) {
		const slug = suffix === 0 ? base : `${base}-${suffix}`;
		const query = authProviderModel.query().where("slug", slug).first();
		if (ignoreId) {
			query.andWhere("id", "!=", ignoreId);
		}
		const existing = await query;
		if (!existing) {
			return slug;
		}
	}

	throw new errs.ValidationError(`Could not generate a unique identifier for "${name}"`);
};

const internalAuthProvider = {
	/**
	 * Reconciles the directory sync timers with what is currently configured.
	 * Called after any change so the schedule never drifts from the database.
	 *
	 * @returns {Promise<Integer>} how many providers are scheduled
	 */
	refreshSchedules: async () => {
		const providers = await internalAuthProvider.getEnabled();
		return sync.reschedule(providers);
	},

	/**
	 * @param   {Access} access
	 * @param   {Object} data
	 * @returns {Promise}
	 */
	create: async (access, data) => {
		await access.can("auth_providers:create", data);

		if (!PROVIDER_TYPES.includes(data.type)) {
			throw new errs.ValidationError(`Unknown authentication provider type: ${data.type}`);
		}

		const row = await authProviderModel.query().insertAndFetch({
			name: data.name,
			type: data.type,
			slug: await generateSlug(data.name),
			is_enabled: typeof data.is_enabled === "undefined" ? true : !!data.is_enabled,
			is_env_managed: false,
			sort_order: data.sort_order || 0,
			meta: normalizeMeta(data.type, data.meta),
		});

		await internalAuditLog.add(access, {
			action: "created",
			object_type: "auth-provider",
			object_id: row.id,
			meta: redactProvider(row),
		});

		await internalAuthProvider.refreshSchedules();
		return redactProvider(row);
	},

	/**
	 * @param   {Access} access
	 * @param   {Object} data
	 * @returns {Promise}
	 */
	update: async (access, data) => {
		await access.can("auth_providers:update", data.id);

		const row = await internalAuthProvider.getRaw(data.id);
		if (row.is_env_managed) {
			throw new errs.ValidationError(
				"This provider is configured through environment variables and cannot be edited here",
			);
		}

		// The type is what determines the shape of meta, so it can't change
		if (typeof data.type !== "undefined" && data.type !== row.type) {
			throw new errs.ValidationError("The type of an existing authentication provider cannot be changed");
		}

		const patch = {};
		if (typeof data.name !== "undefined") {
			patch.name = data.name;
		}
		if (typeof data.is_enabled !== "undefined") {
			patch.is_enabled = !!data.is_enabled;
		}
		if (typeof data.sort_order !== "undefined") {
			patch.sort_order = data.sort_order;
		}
		if (typeof data.meta !== "undefined") {
			patch.meta = internalAuthProvider.mergeMeta(row, data.meta);
		}

		await authProviderModel.query().where("id", row.id).patch(patch);
		const updated = await internalAuthProvider.getRaw(row.id);

		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "auth-provider",
			object_id: updated.id,
			meta: redactProvider(updated),
		});

		await internalAuthProvider.refreshSchedules();
		return redactProvider(updated);
	},

	/**
	 * Secrets are never sent to the client, so an update that leaves them out
	 * (or blank) must keep whatever is already stored.
	 *
	 * @param   {Object} row
	 * @param   {Object} meta
	 * @returns {Object}
	 */
	mergeMeta: (row, meta) => {
		const merged = normalizeMeta(row.type, { ...(row.meta || {}), ...(meta || {}) });
		(SECRET_FIELDS[row.type] || []).forEach((field) => {
			if (!meta || typeof meta[field] === "undefined" || meta[field] === "") {
				merged[field] = row.meta?.[field] || "";
			}
			delete merged[`${field}_set`];
		});
		return merged;
	},

	/**
	 * Fetches a provider including its secrets. For internal use only.
	 *
	 * @param   {Integer} id
	 * @returns {Promise}
	 */
	getRaw: async (id) => {
		const row = await authProviderModel.query().where("id", id).andWhere("is_deleted", 0).first();
		if (!row) {
			throw new errs.ItemNotFoundError(id);
		}
		return row;
	},

	/**
	 * @param   {Access}  access
	 * @param   {Integer} id
	 * @returns {Promise}
	 */
	get: async (access, id) => {
		await access.can("auth_providers:get", id);
		return redactProvider(await internalAuthProvider.getRaw(id));
	},

	/**
	 * @param   {Access} access
	 * @returns {Promise}
	 */
	getAll: async (access) => {
		await access.can("auth_providers:list");
		const rows = await authProviderModel
			.query()
			.where("is_deleted", 0)
			.orderBy("sort_order", "ASC")
			.orderBy("name", "ASC");
		return rows.map(redactProvider);
	},

	/**
	 * @param   {Access}  access
	 * @param   {Integer} id
	 * @returns {Promise}
	 */
	delete: async (access, id, userAction = "convert") => {
		await access.can("auth_providers:delete", id);

		if (!["convert", "delete"].includes(userAction)) {
			throw new errs.ValidationError(
				`Unknown action for this provider's users: ${userAction}. Use "convert" or "delete".`,
			);
		}

		const row = await internalAuthProvider.getRaw(id);
		if (row.is_env_managed) {
			throw new errs.ValidationError(
				"This provider is configured through environment variables. Remove its variables to delete it.",
			);
		}

		// Decide what becomes of its accounts before the provider itself goes,
		// so they are never left pointing at something that no longer exists
		const users = await detachProviderUsers(row, userAction);

		await authProviderModel.query().where("id", row.id).patch({ is_deleted: true, is_enabled: false });

		await internalAuditLog.add(access, {
			action: "deleted",
			object_type: "auth-provider",
			object_id: row.id,
			meta: { ...redactProvider(row), users },
		});

		sync.unschedule(row.id);
		await internalAuthProvider.refreshSchedules();

		// Removing the last provider while the password form is off would leave
		// nobody able to sign in
		const localRestored = await ensureAWayBackIn();

		return { ...users, deleted_provider: true, local_auth_restored: localRestored };
	},

	/**
	 * How many accounts a provider currently owns, and how many of those would
	 * be removed rather than kept if its users were deleted along with it.
	 *
	 * Used to tell an administrator what they are about to do.
	 *
	 * @param   {Access}  access
	 * @param   {Integer} id
	 * @returns {Promise<Object>}
	 */
	getUserImpact: async (access, id) => {
		await access.can("auth_providers:get", id);
		const row = await internalAuthProvider.getRaw(id);

		const links = await authModel.query().where("provider_id", row.id).andWhere("is_deleted", 0);

		let removable = 0;
		for (const link of links) {
			const user = await userModel.query().where("id", link.user_id).andWhere("is_deleted", 0).first();
			if (!user) {
				continue;
			}
			// Anyone with another sign in method survives either way
			const other = await authModel
				.query()
				.where("user_id", user.id)
				.andWhere("is_deleted", 0)
				.andWhere("id", "!=", link.id)
				.first();
			if (!other) {
				removable++;
			}
		}

		return { users: links.length, removable };
	},

	/**
	 * Checks that a provider's settings actually work, without signing anyone in.
	 *
	 * @param   {Access}  access
	 * @param   {Integer} id
	 * @param   {String}  callbackUrl
	 * @returns {Promise}
	 */
	test: async (access, id, callbackUrl) => {
		await access.can("auth_providers:update", id);
		const row = await internalAuthProvider.getRaw(id);

		switch (row.type) {
			case "ldap":
				await ldap.test(row);
				break;
			case "saml":
				await saml.test(row, callbackUrl);
				break;
			case "oauth":
				await oauth.test(row);
				break;
			default:
				throw new errs.ValidationError(`Unknown authentication provider type: ${row.type}`);
		}

		return { valid: true };
	},

	/**
	 * Tests connection settings that have not been saved yet, so the details can
	 * be checked while they are still being filled in.
	 *
	 * When an id is supplied the stored secrets are merged in for any field left
	 * blank, matching how an update behaves: the client never receives a secret
	 * back, so it cannot send one it was not given.
	 *
	 * Unlike the other calls this reports a failure as a result rather than an
	 * error, because the caller wants to show it inline next to the fields.
	 *
	 * @param   {Access} access
	 * @param   {Object} data
	 * @param   {String} data.type
	 * @param   {Object} data.meta
	 * @param   {Integer} [data.id]  An existing provider to take stored secrets from
	 * @returns {Promise<Object>}
	 */
	testConfig: async (access, data) => {
		await access.can("auth_providers:update", data.id || 0);

		if (!PROVIDER_TYPES.includes(data.type)) {
			throw new errs.ValidationError(`Unknown authentication provider type: ${data.type}`);
		}

		let meta = normalizeMeta(data.type, data.meta);

		if (data.id) {
			const stored = await internalAuthProvider.getRaw(data.id);
			if (stored.type !== data.type) {
				throw new errs.ValidationError("The type of an existing authentication provider cannot be changed");
			}
			meta = internalAuthProvider.mergeMeta(stored, data.meta);
		}

		const provider = { id: data.id || 0, name: data.name || "unsaved provider", type: data.type, meta };

		try {
			switch (provider.type) {
				case "ldap":
					await ldap.test(provider);
					return { valid: true, detail: meta.bind_dn ? "bound" : "connected anonymously" };
				case "oauth": {
					const endpoints = await oauth.getEndpoints(provider);
					return {
						valid: true,
						detail: endpoints.issuer ? `discovered ${endpoints.issuer}` : "endpoints configured",
					};
				}
				case "saml":
					await saml.test(provider, data.callback_url || "https://example.com/api/auth/0/callback");
					return { valid: true, detail: "certificate and settings accepted" };
				default:
					throw new errs.ValidationError(`Unknown authentication provider type: ${provider.type}`);
			}
		} catch (err) {
			logger.debug(`Connection test failed for a ${provider.type} provider: ${err.message}`);
			return { valid: false, error: err.message };
		}
	},

	/**
	 * Verifies a real username and password against a provider, without issuing
	 * a token. Lets an administrator confirm a directory works before turning it
	 * on, and shows exactly which attributes came back.
	 *
	 * @param   {Access}  access
	 * @param   {Integer} id
	 * @param   {String}  username
	 * @param   {String}  password
	 * @returns {Promise}
	 */
	testCredentials: async (access, id, username, password) => {
		await access.can("auth_providers:update", id);
		const row = await internalAuthProvider.getRaw(id);

		if (row.type !== "ldap") {
			throw new errs.ValidationError("Only LDAP providers can be tested with a username and password");
		}

		return await ldap.testAuthentication(row, username, password);
	},

	/**
	 * Runs a directory sync now, rather than waiting for the schedule.
	 *
	 * @param   {Access}  access
	 * @param   {Integer} id
	 * @returns {Promise}
	 */
	sync: async (access, id) => {
		await access.can("auth_providers:update", id);
		const row = await internalAuthProvider.getRaw(id);

		if (row.type !== "ldap") {
			throw new errs.ValidationError("Directory sync is only available for LDAP providers");
		}
		if (!row.is_enabled) {
			throw new errs.ValidationError("Enable the provider before syncing it");
		}

		const result = await sync.runSync(row);

		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "auth-provider",
			object_id: row.id,
			meta: { name: row.name, sync: result },
		});

		return result;
	},

	/**
	 * @param   {Access}  access
	 * @param   {Integer} id
	 * @returns {Promise}
	 */
	getSyncStatus: async (access, id) => {
		await access.can("auth_providers:get", id);
		const row = await internalAuthProvider.getRaw(id);

		return {
			supported: row.type === "ldap",
			enabled: !!row.meta?.sync_enabled,
			running: sync.isRunning(row.id),
			last_result: sync.getLastResult(row.id),
		};
	},

	/**
	 * Every enabled provider, with secrets. Used by the login flows.
	 *
	 * @param   {String} [type]
	 * @returns {Promise<[Object]>}
	 */
	getEnabled: async (type) => {
		const query = authProviderModel
			.query()
			.where("is_deleted", 0)
			.andWhere("is_enabled", 1)
			.orderBy("sort_order", "ASC")
			.orderBy("id", "ASC");

		if (type) {
			query.andWhere("type", type);
		}

		return await query;
	},

	/**
	 * Tries every enabled LDAP provider in turn with the supplied credentials.
	 *
	 * A directory that's unreachable or misconfigured is logged and skipped so
	 * that it can't take the remaining providers down with it.
	 *
	 * @param   {String} identity
	 * @param   {String} secret
	 * @returns {Promise<Object|null>} the local user, or null if nothing matched
	 */
	authenticateLdap: async (identity, secret) => {
		const providers = await internalAuthProvider.getEnabled("ldap");

		for (const provider of providers) {
			let result = null;
			try {
				result = await ldap.authenticate(provider, identity, secret);
			} catch (err) {
				logger.error(`LDAP provider "${provider.name}" failed: ${err.message}`);
				continue;
			}

			if (result) {
				logger.info(`Authenticated ${result.email} against LDAP provider "${provider.name}"`);
				return await resolveUser(provider, result);
			}
		}

		return null;
	},

	/**
	 * The unauthenticated view used to render the login page. Deliberately
	 * minimal: an attacker should not learn anything about the configuration.
	 *
	 * @returns {Promise<Object>}
	 */
	getLoginOptions: async () => {
		const providers = await internalAuthProvider.getEnabled();
		const localEnabled = await internalAuthProvider.isLocalAuthEnabled();

		return {
			local_enabled: localEnabled,
			// LDAP is driven by the normal username/password form rather than a button
			ldap_enabled: providers.some((p) => p.type === "ldap"),
			providers: providers
				.filter((p) => p.type === "saml" || p.type === "oauth")
				.map((p) => ({
					id: p.id,
					name: p.name,
					type: p.type,
				})),
		};
	},

	/**
	 * @returns {Promise<Boolean>}
	 */
	isLocalAuthEnabled,

	/**
	 * @param   {Access}  access
	 * @param   {Boolean} enabled
	 * @returns {Promise}
	 */
	setLocalAuthEnabled: async (access, enabled) => {
		await access.can("settings:update", LOCAL_AUTH_SETTING);

		if (!enabled) {
			if (localAuthDisabledByEnv() !== null) {
				// The env var is authoritative either way, so don't pretend otherwise
				throw new errs.ValidationError(
					"Local authentication is controlled by the AUTH_DISABLE_LOCAL environment variable",
				);
			}

			const providers = await internalAuthProvider.getEnabled();
			if (!providers.length) {
				throw new errs.ValidationError(
					"Enable at least one authentication provider before turning off local sign in",
				);
			}

			// Having a provider is not the same as being able to use it. If no
			// administrator has actually signed in through one yet, turning the
			// password form off locks everybody out of their own instance, with
			// no way back in short of editing the database.
			const enabledIds = providers.map((p) => p.id);
			const admins = await userModel.query().where("is_deleted", 0).andWhere("is_disabled", 0);

			const linked = await authModel
				.query()
				.whereIn(
					"user_id",
					admins.filter((u) => (u.roles || []).includes("admin")).map((u) => u.id),
				)
				.andWhere("is_deleted", 0)
				.andWhere("type", "!=", "password")
				.whereIn("provider_id", enabledIds);

			if (!linked.length) {
				throw new errs.ValidationError(
					"No administrator can sign in through a provider yet. Sign in once with an administrator account " +
						"through one of them before turning off local sign in.",
				);
			}
		}

		await settingModel
			.query()
			.where("id", LOCAL_AUTH_SETTING)
			.patch({ value: enabled ? "enabled" : "disabled" });

		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "setting",
			object_id: 0,
			meta: { id: LOCAL_AUTH_SETTING, value: enabled ? "enabled" : "disabled" },
		});

		return { local_enabled: enabled };
	},
};

export default internalAuthProvider;
export { LOCAL_AUTH_SETTING };
