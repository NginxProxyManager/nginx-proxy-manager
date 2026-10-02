import { OAUTH, SAML } from "../lib/auth/definitions.js";
import * as oauth from "../lib/auth/oauth.js";
import { resolveUser } from "../lib/auth/provision.js";
import * as saml from "../lib/auth/saml.js";
import { exchangeCodes, loginFlows } from "../lib/auth/state.js";
import errs from "../lib/error.js";
import { auth as logger } from "../logger.js";
import internalAuthProvider from "./auth-provider.js";
import internalToken from "./token.js";

/**
 * Works out the externally reachable base URL of this instance, which the IdP
 * needs to be able to redirect back to.
 *
 * @param   {Object} req
 * @returns {String}
 */
const getBaseUrl = (req) => {
	if (process.env.AUTH_PUBLIC_URL) {
		return process.env.AUTH_PUBLIC_URL.replace(/\/+$/, "");
	}
	return `${req.protocol}://${req.get("host")}`;
};

/**
 * The redirect/ACS URL registered with the identity provider.
 *
 * @param   {Object}  req
 * @param   {Integer} providerId
 * @returns {String}
 */
const getCallbackUrl = (req, providerId) => `${getBaseUrl(req)}/api/auth/${providerId}/callback`;

const internalAuth = {
	getBaseUrl,
	getCallbackUrl,

	/**
	 * Begins a redirect based login, returning the URL to send the browser to.
	 *
	 * @param   {Object}  req
	 * @param   {Integer} providerId
	 * @returns {Promise<String>}
	 */
	startLogin: async (req, providerId) => {
		const provider = await internalAuth.getEnabledProvider(providerId);
		const callbackUrl = getCallbackUrl(req, provider.id);

		if (provider.type === OAUTH) {
			const flow = oauth.createFlow(callbackUrl);
			const key = loginFlows.put({ providerId: provider.id, ...flow });
			return await oauth.buildAuthorizationUrl(provider, flow, key);
		}

		if (provider.type === SAML) {
			const key = loginFlows.put({ providerId: provider.id, callbackUrl });
			return await saml.buildAuthorizationRequest(provider, callbackUrl, key);
		}

		throw new errs.ValidationError(`Provider "${provider.name}" does not support redirect based sign in`);
	},

	/**
	 * Handles the IdP's response and returns a single use code that the
	 * frontend swaps for a real token.
	 *
	 * @param   {Object}  req
	 * @param   {Integer} providerId
	 * @returns {Promise<String>}
	 */
	completeLogin: async (req, providerId) => {
		const provider = await internalAuth.getEnabledProvider(providerId);

		let identity;

		if (provider.type === OAUTH) {
			const params = { ...req.query, ...req.body };
			if (params.error) {
				// The provider's own wording is logged but not shown: it arrives
				// before anything has been validated, so anyone able to aim a
				// browser at this callback could choose the message the login
				// page displays.
				logger.warn(
					`Provider "${provider.name}" rejected a sign in: ${params.error_description || params.error}`,
				);
				throw new errs.AuthError("The identity provider rejected the sign in");
			}

			const flow = loginFlows.take(params.state);
			if (!flow || flow.providerId !== provider.id) {
				throw new errs.AuthError("This sign in request has expired or was not started here");
			}
			if (!params.code) {
				throw new errs.AuthError("The identity provider did not return an authorization code");
			}

			identity = await oauth.completeAuthorization(provider, flow, params.code);
		} else if (provider.type === SAML) {
			const body = req.body || {};
			const flow = loginFlows.take(body.RelayState);
			if (!flow || flow.providerId !== provider.id) {
				throw new errs.AuthError("This sign in request has expired or was not started here");
			}

			identity = await saml.completeAuthorization(provider, flow.callbackUrl, body);
		} else {
			throw new errs.ValidationError(`Provider "${provider.name}" does not support redirect based sign in`);
		}

		const user = await resolveUser(provider, identity);
		logger.info(`Authenticated ${user.email} against ${provider.type.toUpperCase()} provider "${provider.name}"`);

		return exchangeCodes.put({ userId: user.id, providerId: provider.id });
	},

	/**
	 * Swaps the single use code from a completed SSO login for an access token.
	 *
	 * @param   {String} code
	 * @returns {Promise<Object>}
	 */
	exchange: async (code) => {
		const entry = exchangeCodes.take(code);
		if (!entry) {
			throw new errs.AuthError("This sign in code has expired. Please try again.");
		}
		return await internalToken.getTokenFromUserId(entry.userId);
	},

	/**
	 * @param   {Integer} providerId
	 * @returns {Promise<Object>}
	 */
	getEnabledProvider: async (providerId) => {
		const id = Number.parseInt(providerId, 10);
		if (Number.isNaN(id)) {
			throw new errs.ItemNotFoundError(providerId);
		}

		const provider = await internalAuthProvider.getRaw(id);
		if (!provider.is_enabled) {
			throw new errs.ItemNotFoundError(providerId);
		}
		return provider;
	},

	/**
	 * @param   {Object}  req
	 * @param   {Integer} providerId
	 * @returns {Promise<String>} SP metadata XML
	 */
	getSamlMetadata: async (req, providerId) => {
		const provider = await internalAuth.getEnabledProvider(providerId);
		if (provider.type !== SAML) {
			throw new errs.ItemNotFoundError(providerId);
		}
		return saml.generateMetadata(provider, getCallbackUrl(req, provider.id));
	},
};

export default internalAuth;
