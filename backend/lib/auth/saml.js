import { SAML } from "@node-saml/node-saml";
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

const GROUP_FALLBACKS = ["groups", "memberOf", "Role", "http://schemas.microsoft.com/ws/2008/06/identity/claims/role"];

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
		// We tie the response back to the login request with our own single use
		// RelayState value, so node-saml does not need an InResponseTo cache.
		validateInResponseTo: "never",
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

	return {
		identifier: String(profile.nameID || email),
		email,
		name: readClaim(profile, meta.name_attribute, NAME_FALLBACKS) || email,
		nickname: readClaim(profile, meta.nickname_attribute, NICKNAME_FALLBACKS),
		groups: readClaimList(profile, meta.group_attribute, GROUP_FALLBACKS),
	};
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

export { buildAuthorizationRequest, completeAuthorization, generateMetadata, test };
