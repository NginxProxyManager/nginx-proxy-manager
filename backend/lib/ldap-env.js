/** LDAP env var overrides (LDAP_*) applied on top of DB config. See docs/ldap-authentication.md. */

/** Parse env var as boolean (1/true/yes/on → true). */
const toBool = (v) => /^(1|true|yes|on)$/i.test((v || "").trim());

/** Apply LDAP_ env overrides onto a DB config row (snake_case). */
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

/** Convert snake_case DB row to camelCase config for internalLdap. */
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
