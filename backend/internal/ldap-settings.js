/**
 * Internal LDAP Settings module.
 *
 * Handles CRUD operations for the ldap_config table (single-row, id=1)
 * and delegates test operations to the internalLdap module.
 */

import { applyEnvOverrides } from "../lib/ldap-env.js";
import { ldap as logger } from "../logger.js";
import internalLdap from "./ldap.js";
import LdapConfig from "../models/ldap_config.js";

const BIND_PASSWORD_MASK = "••••••";

/**
 * Map a db row object to a camelCase config object for use with internalLdap.
 *
 * @param  {Object} row  - Raw DB row from ldap_config table
 * @returns {Object}
 */
const rowToConfig = (row) => ({
	serverUrl:     row.server_url,
	bindDN:        row.bind_dn,
	bindPassword:  row.bind_password,
	searchBase:    row.search_base,
	userFilter:    row.user_filter,
	groupDN:       row.group_dn,
	userAttribute: row.user_attribute || "uid",
	adminGroup:    row.admin_group,
	userGroup:     row.user_group,
	enabled:       row.enabled,
	tlsVerify:     row.tls_verify,
	starttls:      row.starttls,
	pageSize:      row.page_size || 0,
});

/**
 * Map an API payload (camelCase) to a db row object (snake_case).
 *
 * @param  {Object} data  - Payload from API
 * @returns {Object}
 */
const payloadToRow = (data) => {
	const row = {};
	if (typeof data.serverUrl     !== "undefined") row.server_url    = data.serverUrl;
	if (typeof data.bindDN        !== "undefined") row.bind_dn       = data.bindDN;
	if (typeof data.bindPassword  !== "undefined") row.bind_password = data.bindPassword;
	if (typeof data.searchBase    !== "undefined") row.search_base   = data.searchBase;
	if (typeof data.userFilter    !== "undefined") row.user_filter   = data.userFilter;
	if (typeof data.groupDN       !== "undefined") row.group_dn      = data.groupDN;
	if (typeof data.userAttribute !== "undefined") row.user_attribute = data.userAttribute;
	if (typeof data.adminGroup    !== "undefined") row.admin_group   = data.adminGroup;
	if (typeof data.userGroup     !== "undefined") row.user_group    = data.userGroup;
	if (typeof data.enabled       !== "undefined") row.enabled       = data.enabled;
	if (typeof data.tlsVerify     !== "undefined") row.tls_verify    = data.tlsVerify;
	if (typeof data.starttls      !== "undefined") row.starttls      = data.starttls;
	if (typeof data.pageSize      !== "undefined") row.page_size     = data.pageSize;
	return row;
};

/**
 * Return a sanitised copy of a row with the bind_password masked.
 *
 * @param  {Object} row
 * @returns {Object}
 */
const _maskPassword = (row) => ({
	...row,
	bindPassword: row.bind_password ? BIND_PASSWORD_MASK : "",
	// Also keep the snake_case version masked if present
	bind_password: row.bind_password ? BIND_PASSWORD_MASK : "",
});

const internalLdapSettings = {
	/**
	 * Retrieve the LDAP configuration (id=1).
	 * Environment variable overrides (LDAP_*) are applied on top of the DB config.
	 * The bind_password is masked in the response.
	 *
	 * An `envOverrides` object is included in the response to indicate which
	 * fields are currently overridden by environment variables (useful for the UI).
	 *
	 * @returns {Promise<Object>}  Config object with masked password
	 */
	getConfig: async () => {
		const row = await LdapConfig.query().where("id", 1).first();

		// Compute which fields are being overridden by environment variables
		const envFields = {
			serverUrl:     !!process.env.LDAP_SERVER_URL,
			bindDN:        !!process.env.LDAP_BIND_DN,
			bindPassword:  !!process.env.LDAP_BIND_PASSWORD,
			searchBase:    !!process.env.LDAP_SEARCH_BASE,
			groupDN:       !!process.env.LDAP_GROUP_DN,
			userAttribute: !!process.env.LDAP_USER_ATTR,
			adminGroup:    !!process.env.LDAP_ADMIN_GROUP,
			userGroup:     !!process.env.LDAP_USER_GROUP,
			enabled:       typeof process.env.LDAP_ENABLED    !== "undefined",
			tlsVerify:     typeof process.env.LDAP_TLS_VERIFY !== "undefined",
			starttls:      typeof process.env.LDAP_STARTTLS   !== "undefined",
			syncFilter:    !!process.env.LDAP_SYNC_FILTER,
			syncGroup:     !!process.env.LDAP_SYNC_GROUP,
		};
		const hasEnvOverrides = Object.values(envFields).some(Boolean);

		if (!row) {
			// Start from an empty/default config and apply env overrides
			const effective = applyEnvOverrides({
				server_url:    "",
				bind_dn:       "",
				bind_password: "",
				search_base:   "",
				user_filter:   "",
				group_dn:      "",
				user_attribute:"uid",
				admin_group:   "",
				user_group:    "",
				enabled:       false,
				tls_verify:    true,
				starttls:      false,
			});

			return {
				id:            null,
				serverUrl:     effective.server_url    || "",
				bindDN:        effective.bind_dn       || "",
				bindPassword:  effective.bind_password ? BIND_PASSWORD_MASK : "",
				searchBase:    effective.search_base   || "",
				userFilter:    effective.user_filter   || "",
				groupDN:       effective.group_dn      || "",
				userAttribute: effective.user_attribute || "uid",
				adminGroup:    effective.admin_group   || "",
				userGroup:     effective.user_group    || "",
				syncGroup:     effective.sync_group    || "",
				enabled:       effective.enabled || false,
				tlsVerify:     effective.tls_verify !== false,
				starttls:      !!effective.starttls,
				pageSize:      0,
				envOverrides:  hasEnvOverrides ? envFields : null,
			};
		}

		// Apply env overrides on top of the DB row
		const effective = applyEnvOverrides(row);

		return {
			id:            row.id,
			serverUrl:     effective.server_url    || "",
			bindDN:        effective.bind_dn       || "",
			bindPassword:  (effective.bind_password || row.bind_password) ? BIND_PASSWORD_MASK : "",
			searchBase:    effective.search_base   || "",
			userFilter:    effective.user_filter   || "",
			groupDN:       effective.group_dn      || "",
			userAttribute: effective.user_attribute || "uid",
			adminGroup:    effective.admin_group   || "",
			userGroup:     effective.user_group    || "",
			syncGroup:     effective.sync_group    || "",
			enabled:       effective.enabled,
			tlsVerify:     effective.tls_verify,
			starttls:      effective.starttls,
			pageSize:      row.page_size || 0,
			createdOn:     row.created_on,
			modifiedOn:    row.modified_on,
			envOverrides:  hasEnvOverrides ? envFields : null,
		};
	},
	},

	/**
	 * Upsert the LDAP configuration.
	 * If bind_password is the mask value, it is NOT overwritten.
	 *
	 * @param  {Object} data  - Payload from API (camelCase)
	 * @returns {Promise<Object>}  Updated config with masked password
	 */
	updateConfig: async (data) => {
		const existing = await LdapConfig.query().where("id", 1).first();

		const row = payloadToRow(data);

		// If the caller sent back the mask, preserve the existing password
		if (row.bind_password === BIND_PASSWORD_MASK) {
			delete row.bind_password;
		}

		if (existing) {
			await LdapConfig.query().where("id", 1).patch(row);
		} else {
			await LdapConfig.query().insert({ ...row, id: 1 });
		}

		return internalLdapSettings.getConfig();
	},

	/**
	 * Test the LDAP connection using the provided config.
	 * Merges saved DB config (with env overrides) as fallback so that a partial
	 * payload (e.g. missing serverUrl due to a race condition or stale form state)
	 * still works correctly. Request body fields take precedence over saved values.
	 * If bind_password is the mask, the saved password is substituted.
	 *
	 * @param  {Object} data  - Config from API (camelCase)
	 * @returns {Promise<{ success: boolean, message: string }>}
	 */
	testConnection: async (data) => {
		// Load saved config and apply env overrides as fallback (same as testAuth)
		const saved = await LdapConfig.query().where("id", 1).first();
		const savedRow = applyEnvOverrides(saved || {});
		const savedConfig = rowToConfig(savedRow);

		// Merge: saved config is the base; body fields override, but we skip empty
		// strings so that a stale/partial payload cannot blank out required fields.
		// Boolean false values (tlsVerify: false, starttls: false) are preserved.
		const bodyOverrides = Object.fromEntries(
			Object.entries(data).filter(([, v]) => v !== "" && v !== null && v !== undefined),
		);
		const config = {
			...savedConfig,
			...bodyOverrides,
		};

		// Resolve masked/missing password — env var > DB row > provided value
		if (config.bindPassword === BIND_PASSWORD_MASK || !config.bindPassword) {
			config.bindPassword = savedConfig.bindPassword || "";
		}

		// Validate minimum required fields
		try {
			internalLdap.validateConfig(config);
		} catch (err) {
			return { success: false, message: err.message };
		}

		logger.info(`[ldap-settings] Testing connection to ${config.serverUrl}`);
		return internalLdap.testConnection(config);
	},

	/**
	 * Test LDAP authentication for the given username/password.
	 * The LDAP server config is merged from the provided data and the saved config.
	 *
	 * @param  {Object} configData  - Config from API (camelCase), may omit some fields
	 * @param  {string} username
	 * @param  {string} password
	 * @returns {Promise<{ success: boolean, message: string, user?: Object }>}
	 */
	testAuth: async (configData, username, password) => {
		if (!username || !password) {
			return { success: false, message: "Username and password are required" };
		}

		// Merge with saved config as fallback, then apply env overrides
		const saved = await LdapConfig.query().where("id", 1).first();
		const savedRow = applyEnvOverrides(saved || {});
		const savedConfig = rowToConfig(savedRow);

		const config = {
			...savedConfig,
			...configData,
		};

		// Resolve masked password — env var > DB row > provided config
		if (config.bindPassword === BIND_PASSWORD_MASK || !config.bindPassword) {
			config.bindPassword = savedConfig.bindPassword || "";
		}

		try {
			internalLdap.validateConfig(config);
		} catch (err) {
			return { success: false, message: err.message };
		}

		try {
			const userEntry = await internalLdap.authenticateUser(config, username, password);
			const normalized = internalLdap.normalizeUser(userEntry, config.userAttribute);
			logger.info(`[ldap-settings] Test auth succeeded for "${username}"`);
			return {
				success: true,
				message: `Authentication successful for "${normalized.displayName || username}"`,
				user: normalized,
			};
		} catch (err) {
			logger.warn(`[ldap-settings] Test auth failed for "${username}": ${err.message}`);
			return { success: false, message: err.message };
		}
	},
};

export default internalLdapSettings;
