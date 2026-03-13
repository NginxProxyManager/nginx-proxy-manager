/**
 * LDAP Environment Variable Overrides
 *
 * Applies LDAP_ environment variables on top of a database config row.
 * Env vars take precedence over DB config, making this suitable for
 * Docker / Kubernetes deployments where config is supplied via environment.
 *
 * Expected input: raw DB row object (snake_case keys) or null/empty object.
 * Returns: merged config object (snake_case keys) with env overrides applied.
 *
 * Supported environment variables:
 *   LDAP_ENABLED        — "true" / "false" / "1" / "0"
 *   LDAP_SERVER_URL     — e.g. "ldap://dc.example.com" or "ldaps://..."
 *   LDAP_BIND_DN        — service account DN
 *   LDAP_BIND_PASSWORD  — service account password
 *   LDAP_SEARCH_BASE    — user/group search base
 *   LDAP_GROUP_DN       — group search base (defaults to LDAP_SEARCH_BASE)
 *   LDAP_USER_ATTR      — login attribute (default: "uid")
 *   LDAP_ADMIN_GROUP    — DN or CN of the admin group
 *   LDAP_USER_GROUP     — DN or CN of the required user group
 *   LDAP_TLS_VERIFY     — "true" / "false"
 *   LDAP_STARTTLS       — "true" / "false"
 *   LDAP_MAX_CONNECTIONS — integer (default: 10)  hard cap on simultaneous pool connections
 *   LDAP_ACQUIRE_TIMEOUT — integer ms (default: 5000)  wait time when pool is exhausted
 *   LDAP_LOGIN_ATTRS    — comma-separated list of attributes tried for login
 *                         e.g. "uid,mail,sAMAccountName,cn" (default: use user_attribute only)
 *   LDAP_SYNC_FILTER    — LDAP search filter used by syncAllUsers to enumerate directory
 *                         entries. Overrides the `user_filter` DB field.
 *                         When unset, the default filter is directory-type-aware:
 *                           AD:      (&(objectClass=user)(objectCategory=person)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))
 *                           OpenLDAP:(objectClass=inetOrgPerson)
 *                         Example for AD with custom OU:
 *                           LDAP_SYNC_FILTER="(&(objectClass=user)(objectCategory=person)(memberOf=cn=npm-users,ou=Groups,dc=example,dc=com))"
 *   LDAP_SYNC_GROUP     — DN or CN of an LDAP group. When set, only members of this
 *                         group are included in the sync. The sync filter is automatically
 *                         wrapped with a `(memberOf=<group>)` condition (AD) or the group
 *                         membership is checked post-search (OpenLDAP).
 *                         This is separate from LDAP_USER_GROUP (which controls access
 *                         *after* sync) — LDAP_SYNC_GROUP prevents non-members from being
 *                         synced into NPM at all, reducing noise and DB bloat.
 */

/**
 * Parse a string env var as a boolean.
 *
 * @param  {string|undefined} v
 * @returns {boolean}
 */
const toBool = (v) => /^(1|true|yes|on)$/i.test((v || "").trim());

/**
 * Apply LDAP_ environment variable overrides onto a base config object.
 *
 * @param  {Object|null} row  Raw DB row (snake_case keys) or null
 * @returns {Object}          Merged config with env overrides applied (snake_case keys)
 */
const applyEnvOverrides = (row) => {
	const config = row ? { ...row } : {};

	// String overrides — only apply when the env var is non-empty
	if (process.env.LDAP_SERVER_URL)    config.server_url    = process.env.LDAP_SERVER_URL;
	if (process.env.LDAP_BIND_DN)       config.bind_dn       = process.env.LDAP_BIND_DN;
	if (process.env.LDAP_BIND_PASSWORD) config.bind_password = process.env.LDAP_BIND_PASSWORD;
	if (process.env.LDAP_SEARCH_BASE)   config.search_base   = process.env.LDAP_SEARCH_BASE;
	if (process.env.LDAP_GROUP_DN)      config.group_dn      = process.env.LDAP_GROUP_DN;
	if (process.env.LDAP_USER_ATTR)     config.user_attribute  = process.env.LDAP_USER_ATTR;
	if (process.env.LDAP_LOGIN_ATTRS)   config.login_attributes = process.env.LDAP_LOGIN_ATTRS;
	if (process.env.LDAP_ADMIN_GROUP)   config.admin_group   = process.env.LDAP_ADMIN_GROUP;
	if (process.env.LDAP_USER_GROUP)    config.user_group    = process.env.LDAP_USER_GROUP;
	if (process.env.LDAP_SYNC_FILTER)   config.user_filter   = process.env.LDAP_SYNC_FILTER;
	if (process.env.LDAP_SYNC_GROUP)    config.sync_group    = process.env.LDAP_SYNC_GROUP;

	// Boolean overrides — apply whenever the env var is defined (even "false")
	if (typeof process.env.LDAP_ENABLED    !== "undefined") config.enabled   = toBool(process.env.LDAP_ENABLED);
	if (typeof process.env.LDAP_TLS_VERIFY !== "undefined") config.tls_verify = toBool(process.env.LDAP_TLS_VERIFY);
	if (typeof process.env.LDAP_STARTTLS   !== "undefined") config.starttls  = toBool(process.env.LDAP_STARTTLS);

	// Integer overrides — only apply when the env var parses to a valid positive integer
	if (process.env.LDAP_MAX_CONNECTIONS) {
		const v = Number.parseInt(process.env.LDAP_MAX_CONNECTIONS, 10);
		if (v > 0) {
			config.max_connections = v;
		}
	}
	if (process.env.LDAP_ACQUIRE_TIMEOUT) {
		const v = Number.parseInt(process.env.LDAP_ACQUIRE_TIMEOUT, 10);
		if (v > 0) {
			config.acquire_timeout = v;
		}
	}

	return config;
};

/**
 * Build an internalLdap-compatible config object (camelCase) from a raw
 * DB row after applying env overrides.
 *
 * @param  {Object} row  Raw DB row (snake_case) — already env-overridden
 * @returns {Object}     camelCase config for internalLdap / LdapClient
 */
const rowToLdapClientConfig = (row) => ({
	serverUrl:      row.server_url    || "",
	bindDN:         row.bind_dn       || "",
	bindPassword:   row.bind_password || "",
	searchBase:     row.search_base   || "",
	groupDN:        row.group_dn      || row.search_base || "",
	userAttribute:  row.user_attribute || "uid",
	// loginAttributes: comma-separated list of LDAP attributes accepted at login
	// e.g. "uid,mail,sAMAccountName,cn" — builds an OR filter in searchUser
	loginAttributes: row.login_attributes || null,
	tlsVerify:      row.tls_verify !== false,
	starttls:       !!row.starttls,
	maxConnections: row.max_connections ?? undefined,
	acquireTimeout: row.acquire_timeout ?? undefined,
});

export { applyEnvOverrides, rowToLdapClientConfig };
