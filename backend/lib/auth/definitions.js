/**
 * Definitions for the supported external authentication provider types.
 *
 * Each type declares the meta fields it understands, which of those fields hold
 * secrets (and must never be sent back over the API) and the defaults applied
 * when a field is left empty.
 */

const LDAP = "ldap";
const SAML = "saml";
const OAUTH = "oauth";

const PROVIDER_TYPES = [LDAP, SAML, OAUTH];

/**
 * Fields whose values are write-only. They are stripped from every API response
 * and, when an update omits them, the previously stored value is kept.
 */
const SECRET_FIELDS = {
	[LDAP]: ["bind_password"],
	[SAML]: ["sp_private_key"],
	[OAUTH]: ["client_secret"],
};

const COMMON_DEFAULTS = {
	// Create a local user the first time an unknown identity signs in
	auto_create_user: false,
	// When a user is auto created, give them these roles
	default_roles: [],
	// Optional: identities in this group/claim value become admins
	admin_group: "",
};

const DEFAULTS = {
	[LDAP]: {
		...COMMON_DEFAULTS,
		url: "",
		bind_dn: "",
		bind_password: "",
		base_dn: "",
		// {{username}} is replaced with whatever was typed into the login form
		user_filter: "(|(uid={{username}})(mail={{username}}))",
		email_attribute: "mail",
		name_attribute: "cn",
		nickname_attribute: "givenName",
		group_attribute: "memberOf",
		// Optional reverse lookup, for directories that don't expose memberOf.
		// {{dn}} and {{username}} are substituted before searching.
		group_base_dn: "",
		group_filter: "",
		group_name_attribute: "dn",
		// Comma separated attributes accepted at the login prompt. When set this
		// builds the search filter, which is friendlier than writing one by hand;
		// user_filter still wins if both are present.
		login_attributes: "",
		start_tls: false,
		tls_reject_unauthorized: true,
		timeout: 10000,
		// Directories cap how many entries one search may return (1000 in Active
		// Directory by default). Paging walks past that limit.
		page_size: 500,

		// --- directory sync ------------------------------------------------
		// Walks the directory on a schedule so accounts exist before anyone
		// signs in, and so group changes are picked up without a login.
		sync_enabled: false,
		sync_interval: 60,
		// Restricts which entries sync considers; defaults to every person
		sync_filter: "(objectClass=person)",
		// Only sync members of this group, when set
		sync_group: "",
		// Disable local accounts whose directory entry has gone away
		sync_disable_missing: false,
	},
	[SAML]: {
		...COMMON_DEFAULTS,
		entry_point: "",
		// The SP entity id we advertise to the IdP
		issuer: "nginx-proxy-manager",
		idp_cert: "",
		sp_private_key: "",
		signature_algorithm: "sha256",
		want_assertions_signed: true,
		want_authn_response_signed: false,
		email_attribute: "",
		name_attribute: "",
		nickname_attribute: "",
		group_attribute: "",
	},
	[OAUTH]: {
		...COMMON_DEFAULTS,
		// When set, endpoints are resolved via OIDC discovery
		issuer_url: "",
		authorization_url: "",
		token_url: "",
		userinfo_url: "",
		jwks_url: "",
		client_id: "",
		client_secret: "",
		scopes: "openid email profile",
		email_claim: "email",
		name_claim: "name",
		nickname_claim: "preferred_username",
		group_claim: "groups",
		// Send credentials in the Authorization header rather than the body
		use_basic_auth: false,
	},
};

/**
 * Applies the defaults for a type over the top of a supplied meta object,
 * dropping anything the type doesn't know about.
 *
 * @param   {String} type
 * @param   {Object} [meta]
 * @returns {Object}
 */
const normalizeMeta = (type, meta) => {
	const defaults = DEFAULTS[type];
	if (!defaults) {
		return {};
	}

	const result = {};
	Object.keys(defaults).forEach((key) => {
		result[key] = typeof meta?.[key] === "undefined" || meta[key] === null ? defaults[key] : meta[key];
	});
	return result;
};

/**
 * Removes secret values from a provider's meta so it can be sent to a client.
 * Secrets are replaced with a boolean `<field>_set` marker so the UI can show
 * whether a value exists without revealing it.
 *
 * @param   {Object} provider
 * @returns {Object}
 */
const redactProvider = (provider) => {
	if (!provider) {
		return provider;
	}

	const meta = { ...(provider.meta || {}) };
	(SECRET_FIELDS[provider.type] || []).forEach((field) => {
		meta[`${field}_set`] = !!meta[field];
		delete meta[field];
	});

	return { ...provider, meta };
};

export { LDAP, SAML, OAUTH, PROVIDER_TYPES, SECRET_FIELDS, DEFAULTS, normalizeMeta, redactProvider };
