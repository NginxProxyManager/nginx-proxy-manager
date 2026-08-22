import { auth as logger } from "../../logger.js";
import authProviderModel from "../../models/auth_provider.js";
import { LDAP, normalizeMeta, OAUTH, PROVIDER_TYPES, SAML } from "./definitions.js";

const toBool = (value, fallback) => {
	if (typeof value === "undefined" || value === null || value === "") {
		return fallback;
	}
	return /^(1|true|yes|on)$/i.test(String(value).trim());
};

const toInt = (value, fallback) => {
	const parsed = Number.parseInt(value, 10);
	return Number.isNaN(parsed) ? fallback : parsed;
};

const toList = (value) =>
	String(value || "")
		.split(",")
		.map((v) => v.trim())
		.filter((v) => v !== "");

/**
 * Secrets can also be supplied as docker secrets: the container's startup
 * scripts expand any `<NAME>__FILE` variable into `<NAME>` before we run, so
 * there is nothing extra to do here.
 *
 * @param   {String} name
 * @returns {String|undefined}
 */
const env = (name) => process.env[name];

/**
 * Builds the meta object for one provider type from environment variables.
 *
 * @param   {String} type
 * @returns {Object}
 */
const buildMeta = (type) => {
	const common = {
		auto_create_user: toBool(env(`AUTH_${type.toUpperCase()}_AUTO_CREATE_USER`), false),
		default_roles: toList(env(`AUTH_${type.toUpperCase()}_DEFAULT_ROLES`)),
		admin_group: env(`AUTH_${type.toUpperCase()}_ADMIN_GROUP`) || "",
	};

	switch (type) {
		case LDAP:
			return normalizeMeta(LDAP, {
				...common,
				url: env("AUTH_LDAP_URL"),
				bind_dn: env("AUTH_LDAP_BIND_DN"),
				bind_password: env("AUTH_LDAP_BIND_PASSWORD"),
				base_dn: env("AUTH_LDAP_BASE_DN"),
				user_filter: env("AUTH_LDAP_USER_FILTER"),
				email_attribute: env("AUTH_LDAP_EMAIL_ATTRIBUTE"),
				name_attribute: env("AUTH_LDAP_NAME_ATTRIBUTE"),
				nickname_attribute: env("AUTH_LDAP_NICKNAME_ATTRIBUTE"),
				group_attribute: env("AUTH_LDAP_GROUP_ATTRIBUTE"),
				group_base_dn: env("AUTH_LDAP_GROUP_BASE_DN"),
				group_filter: env("AUTH_LDAP_GROUP_FILTER"),
				group_name_attribute: env("AUTH_LDAP_GROUP_NAME_ATTRIBUTE"),
				login_attributes: env("AUTH_LDAP_LOGIN_ATTRIBUTES"),
				start_tls: toBool(env("AUTH_LDAP_START_TLS"), false),
				tls_reject_unauthorized: toBool(env("AUTH_LDAP_TLS_REJECT_UNAUTHORIZED"), true),
				timeout: toInt(env("AUTH_LDAP_TIMEOUT"), 10000),
				page_size: toInt(env("AUTH_LDAP_PAGE_SIZE"), 500),
				sync_enabled: toBool(env("AUTH_LDAP_SYNC_ENABLED"), false),
				sync_interval: toInt(env("AUTH_LDAP_SYNC_INTERVAL"), 60),
				sync_filter: env("AUTH_LDAP_SYNC_FILTER"),
				sync_group: env("AUTH_LDAP_SYNC_GROUP"),
				sync_disable_missing: toBool(env("AUTH_LDAP_SYNC_DISABLE_MISSING"), false),
			});

		case SAML:
			return normalizeMeta(SAML, {
				...common,
				entry_point: env("AUTH_SAML_ENTRY_POINT"),
				issuer: env("AUTH_SAML_ISSUER"),
				idp_cert: env("AUTH_SAML_IDP_CERT"),
				sp_private_key: env("AUTH_SAML_SP_PRIVATE_KEY"),
				signature_algorithm: env("AUTH_SAML_SIGNATURE_ALGORITHM"),
				want_assertions_signed: toBool(env("AUTH_SAML_WANT_ASSERTIONS_SIGNED"), true),
				want_authn_response_signed: toBool(env("AUTH_SAML_WANT_AUTHN_RESPONSE_SIGNED"), false),
				email_attribute: env("AUTH_SAML_EMAIL_ATTRIBUTE"),
				name_attribute: env("AUTH_SAML_NAME_ATTRIBUTE"),
				nickname_attribute: env("AUTH_SAML_NICKNAME_ATTRIBUTE"),
				group_attribute: env("AUTH_SAML_GROUP_ATTRIBUTE"),
			});

		case OAUTH:
			return normalizeMeta(OAUTH, {
				...common,
				issuer_url: env("AUTH_OAUTH_ISSUER_URL"),
				authorization_url: env("AUTH_OAUTH_AUTHORIZATION_URL"),
				token_url: env("AUTH_OAUTH_TOKEN_URL"),
				userinfo_url: env("AUTH_OAUTH_USERINFO_URL"),
				jwks_url: env("AUTH_OAUTH_JWKS_URL"),
				client_id: env("AUTH_OAUTH_CLIENT_ID"),
				client_secret: env("AUTH_OAUTH_CLIENT_SECRET"),
				scopes: env("AUTH_OAUTH_SCOPES"),
				email_claim: env("AUTH_OAUTH_EMAIL_CLAIM"),
				name_claim: env("AUTH_OAUTH_NAME_CLAIM"),
				nickname_claim: env("AUTH_OAUTH_NICKNAME_CLAIM"),
				group_claim: env("AUTH_OAUTH_GROUP_CLAIM"),
				use_basic_auth: toBool(env("AUTH_OAUTH_USE_BASIC_AUTH"), false),
			});

		default:
			return {};
	}
};

const DEFAULT_NAMES = {
	[LDAP]: "LDAP",
	[SAML]: "SAML",
	[OAUTH]: "OAuth",
};

/**
 * Returns the provider definitions described by the environment.
 *
 * At most one provider of each type can be configured this way; anything more
 * elaborate belongs in the UI.
 *
 * @returns {[Object]}
 */
const getEnvProviders = () =>
	PROVIDER_TYPES.filter((type) => toBool(env(`AUTH_${type.toUpperCase()}_ENABLED`), false)).map((type, idx) => ({
		slug: `env-${type}`,
		type,
		name: env(`AUTH_${type.toUpperCase()}_NAME`) || DEFAULT_NAMES[type],
		is_enabled: true,
		is_env_managed: true,
		is_deleted: false,
		sort_order: idx,
		meta: buildMeta(type),
	}));

/**
 * Reconciles the environment configured providers with the database.
 *
 * Rows are owned by the environment: they're recreated from scratch on every
 * boot, and removed when their variables go away. Providers created in the UI
 * are never touched.
 *
 * @returns {Promise}
 */
const syncEnvProviders = async () => {
	const wanted = getEnvProviders();
	const wantedSlugs = wanted.map((p) => p.slug);

	const existing = await authProviderModel.query().where("is_env_managed", 1);

	// Drop rows whose environment variables have been removed
	const stale = existing.filter((row) => !wantedSlugs.includes(row.slug) && !row.is_deleted);
	for (const row of stale) {
		await authProviderModel.query().where("id", row.id).patch({ is_deleted: true, is_enabled: false });
		logger.info(`Removed environment configured auth provider: ${row.slug}`);
	}

	for (const provider of wanted) {
		const row = existing.find((r) => r.slug === provider.slug);
		if (row) {
			await authProviderModel.query().where("id", row.id).patch(provider);
			logger.info(`Updated environment configured auth provider: ${provider.slug} (${provider.type})`);
		} else {
			await authProviderModel.query().insert(provider);
			logger.info(`Added environment configured auth provider: ${provider.slug} (${provider.type})`);
		}
	}

	return wanted.length;
};

/**
 * Whether local email/password sign in has been switched off by environment.
 * When unset, the database setting decides.
 *
 * @returns {Boolean|null}
 */
const localAuthDisabledByEnv = () => {
	if (typeof process.env.AUTH_DISABLE_LOCAL === "undefined" || process.env.AUTH_DISABLE_LOCAL === "") {
		return null;
	}
	return toBool(process.env.AUTH_DISABLE_LOCAL, false);
};

export { getEnvProviders, syncEnvProviders, localAuthDisabledByEnv };
