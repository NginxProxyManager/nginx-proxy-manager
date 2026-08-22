import { SAML } from "@node-saml/node-saml";
import { auth as logger } from "../../logger.js";
import errs from "../error.js";

/**
 * Attribute names in a SAML assertion are frequently long URNs, so look the
 * value up by the configured name first and then fall back to the well known
 * claim URIs and short names that most IdPs emit.
 *
 * @param   {Object}   profile
 * @param   {String}   configured
 * @param   {[String]} fallbacks
 * @returns {String|null}
 */
const readClaim = (profile, configured, fallbacks) => {
	const candidates = configured ? [configured] : fallbacks;
	for (const key of candidates) {
		const value = profile?.[key] ?? profile?.attributes?.[key];
		if (Array.isArray(value) && value.length) {
			return String(value[0]);
		}
		if (typeof value === "string" && value !== "") {
			return value;
		}
	}
	return null;
};

const readClaimList = (profile, configured, fallbacks) => {
	const candidates = configured ? [configured] : fallbacks;
	for (const key of candidates) {
		const value = profile?.[key] ?? profile?.attributes?.[key];
		if (Array.isArray(value)) {
			return value.map(String);
		}
		if (typeof value === "string" && value !== "") {
			return [value];
		}
	}
	return [];
};

const EMAIL_FALLBACKS = [
	"email",
	"mail",
	"nameID",
	"http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
	"urn:oid:0.9.2342.19200300.100.1.3",
];

const NAME_FALLBACKS = [
	"displayName",
	"cn",
	"name",
	"http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
	"urn:oid:2.5.4.3",
];

const NICKNAME_FALLBACKS = [
	"givenName",
	"firstName",
	"http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
	"urn:oid:2.5.4.42",
];

/**
 * A transient NameID is a per-session pseudonym: the IdP issues a different one
 * every time. It says nothing about who somebody is, so it cannot be what we
 * remember them by — a directory of them would grow a new entry per login.
 */
const TRANSIENT_NAMEID = "urn:oasis:names:tc:SAML:2.0:nameid-format:transient";

const GROUP_FALLBACKS = ["groups", "memberOf", "Role", "http://schemas.microsoft.com/ws/2008/06/identity/claims/role"];

/**
 * Outstanding SAML request ids, so an assertion can be tied back to the request
 * that asked for it.
 *
 * A fresh SAML instance is built per request, and node-saml's own default cache
 * lives on the instance, so the id saved when the login started would be gone by
 * the time the response arrived. This one is shared across them all.
 *
 * The backend is a single process, so a Map is enough. It empties on restart,
 * which at worst asks somebody mid-login to press the button again.
 */
const REQUEST_TTL_MS = 10 * 60 * 1000;

const requestCache = {
	entries: new Map(),

	prune() {
		const now = Date.now();
		this.entries.forEach((entry, key) => {
			if (entry.createdAt + REQUEST_TTL_MS <= now) {
				this.entries.delete(key);
			}
		});
	},

	async saveAsync(key, value) {
		this.prune();
		if (this.entries.has(key)) {
			return null;
		}
		const item = { value, createdAt: Date.now() };
		this.entries.set(key, item);
		return item;
	},

	async getAsync(key) {
		this.prune();
		return this.entries.get(key)?.value ?? null;
	},

	async removeAsync(key) {
		if (key === null || !this.entries.has(key)) {
			return null;
		}
		this.entries.delete(key);
		return key;
	},
};

/**
 * Builds a configured node-saml instance for a provider.
 *
 * @param   {Object} provider
 * @param   {String} callbackUrl
 * @returns {SAML}
 */
const createSaml = (provider, callbackUrl) => {
	const meta = provider.meta || {};

	if (!meta.entry_point) {
		throw new errs.ConfigurationError("SAML provider has no sign-in URL (entry point) configured");
	}
	if (!meta.idp_cert) {
		throw new errs.ConfigurationError("SAML provider has no IdP signing certificate configured");
	}

	return new SAML({
		callbackUrl,
		entryPoint: meta.entry_point,
		issuer: meta.issuer || "nginx-proxy-manager",
		idpCert: meta.idp_cert,
		privateKey: meta.sp_private_key || undefined,
		signatureAlgorithm: meta.signature_algorithm || "sha256",
		wantAssertionsSigned: meta.want_assertions_signed !== false,
		wantAuthnResponseSigned: meta.want_authn_response_signed === true,
		// Every assertion must name the request it answers, and each request is
		// only answerable once. Without this a captured assertion could be
		// replayed until it expired, since a signature stays valid whoever
		// presents it. This rules out IdP initiated sign in, which is the point:
		// a login has to start here.
		validateInResponseTo: "always",
		cacheProvider: requestCache,
		audience: meta.issuer || "nginx-proxy-manager",
		disableRequestedAuthnContext: true,
	});
};

/**
 * @param   {Object} provider
 * @param   {String} callbackUrl
 * @param   {String} relayState  Single use key identifying this login attempt
 * @returns {Promise<String>} the URL to redirect the browser to
 */
const buildAuthorizationRequest = async (provider, callbackUrl, relayState) => {
	const saml = createSaml(provider, callbackUrl);
	return await saml.getAuthorizeUrlAsync(relayState, undefined, {});
};

/**
 * Validates a SAML response posted back by the IdP.
 *
 * @param   {Object} provider
 * @param   {String} callbackUrl
 * @param   {Object} body  The raw request body ({ SAMLResponse, RelayState })
 * @returns {Promise<Object>}
 */
const completeAuthorization = async (provider, callbackUrl, body) => {
	const meta = provider.meta || {};
	const saml = createSaml(provider, callbackUrl);

	const { profile } = await saml.validatePostResponseAsync(body);
	if (!profile) {
		throw new errs.AuthError("The identity provider did not return a valid assertion");
	}

	const email = readClaim(profile, meta.email_attribute, EMAIL_FALLBACKS);
	if (!email) {
		throw new errs.AuthError(
			"The SAML assertion did not contain an email address. Set an email attribute on the provider.",
		);
	}

	const { identifier, source } = stableIdentifier(provider, profile, email);

	return {
		identifier,
		identifier_source: source,
		email,
		name: readClaim(profile, meta.name_attribute, NAME_FALLBACKS) || email,
		nickname: readClaim(profile, meta.nickname_attribute, NICKNAME_FALLBACKS),
		groups: readClaimList(profile, meta.group_attribute, GROUP_FALLBACKS),
	};
};

/**
 * Picks something to remember a person by that will still be the same tomorrow.
 *
 * The NameID is the natural choice, but only when the IdP issues a lasting one.
 * simpleSAMLphp and several hosted IdPs default to a transient format, and
 * keying off that would mean nobody is ever recognised twice. When that is what
 * comes back, the email address in the assertion is used instead — it is
 * scoped to this provider either way, so it only ever matches the account this
 * same provider created.
 *
 * @param   {Object} provider
 * @param   {Object} profile
 * @param   {String} email
 * @returns {Object} { identifier, source }
 */
const stableIdentifier = (provider, profile, email) => {
	const attribute = (provider.meta?.identifier_attribute || "").trim();
	if (attribute) {
		const value = readClaim(profile, attribute, []);
		if (value) {
			return { identifier: String(value), source: attribute };
		}
		logger.warn(
			`SAML provider "${provider.name}" is set to identify people by "${attribute}", which the assertion did not contain`,
		);
	}

	if (profile.nameID && profile.nameIDFormat !== TRANSIENT_NAMEID) {
		return { identifier: String(profile.nameID), source: "nameID" };
	}

	if (profile.nameID) {
		logger.debug(
			`SAML provider "${provider.name}" returned a transient NameID, so ${email} is identified by email address instead`,
		);
	}

	return { identifier: email, source: "email" };
};

/**
 * Generates the SP metadata XML that can be handed to the IdP.
 *
 * @param   {Object} provider
 * @param   {String} callbackUrl
 * @returns {String}
 */
const generateMetadata = (provider, callbackUrl) => {
	const saml = createSaml(provider, callbackUrl);
	return saml.generateServiceProviderMetadata(null, null);
};

/**
 * @param   {Object} provider
 * @param   {String} callbackUrl
 * @returns {Promise}
 */
const test = async (provider, callbackUrl) => {
	// Constructing the instance validates the certificate and required settings
	createSaml(provider, callbackUrl);
};

export { buildAuthorizationRequest, completeAuthorization, generateMetadata, requestCache, test };
