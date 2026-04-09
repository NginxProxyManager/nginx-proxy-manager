import * as oidcClient from "openid-client";
import errs from "../lib/error.js";
import { decryptSecret, encryptSecret } from "../lib/crypto.js";
import { debug, oidc as logger } from "../logger.js";
import authModel from "../models/auth.js";
import settingModel from "../models/setting.js";
import TokenModel from "../models/token.js";
import userModel from "../models/user.js";
import userPermissionModel from "../models/user_permission.js";
import internalAuditLog from "./audit-log.js";
import internalToken from "./token.js";
import twoFactor from "./2fa.js";
import Access from "../lib/access.js";
import gravatar from "gravatar";
import { getFileProviders } from "../lib/oidc-file-config.js";

const SETTING_ID = "oidc-config";

// Discovery cache: maps discovery_url -> { config, expiresAt }
const discoveryCache = new Map();
const DISCOVERY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Validate that a URL uses HTTPS (SSRF mitigation)
 * @param {string} url
 * @throws {ConfigurationError} if not HTTPS
 */
function enforceHttps(url) {
	if (!url || !url.startsWith("https://")) {
		throw new errs.ConfigurationError("OIDC discovery URL must use HTTPS");
	}
}

/**
 * Get the discovered OIDC configuration for a provider, with caching.
 * @param {Object} providerConfig
 * @returns {Promise<oidcClient.Configuration>}
 */
async function discoverProvider(providerConfig) {
	const cacheKey = providerConfig.discovery_url;
	const cached = discoveryCache.get(cacheKey);

	if (cached && cached.expiresAt > Date.now()) {
		debug(logger, `Using cached OIDC discovery for ${cacheKey}`);
		return cached.config;
	}

	debug(logger, `Discovering OIDC provider at ${cacheKey}`);
	enforceHttps(cacheKey);

	let config;
	try {
		config = await oidcClient.discovery(
			new URL(providerConfig.discovery_url),
			providerConfig.client_id,
			{ client_secret: providerConfig.client_secret },
			oidcClient.ClientSecretBasic(),
		);
	} catch (err) {
		throw new errs.ConfigurationError(`OIDC provider is not reachable or returned invalid discovery document: ${err.message}`);
	}

	discoveryCache.set(cacheKey, { config, expiresAt: Date.now() + DISCOVERY_CACHE_TTL_MS });
	return config;
}

/**
 * Get the plaintext client secret for a provider, handling both DB-sourced
 * (AES-256-GCM encrypted) and file-sourced (already plaintext) providers.
 *
 * @param {Object} provider - Provider object with _source and client_secret fields
 * @returns {string} plaintext client secret
 */
function getPlaintextSecret(provider) {
	if (!provider.client_secret) {
		return "";
	}
	if (provider._source === "file") {
		// File-sourced secrets are already plaintext (env-var-expanded at load time)
		return provider.client_secret;
	}
	return decryptSecret(provider.client_secret);
}

const internalOidc = {

	/**
	 * Get the full OIDC configuration, merging DB-stored and file-sourced providers.
	 * File providers take precedence on ID conflict.
	 * DB providers have _source: "db"; file providers have _source: "file".
	 *
	 * @returns {Promise<{providers: Array}>}
	 */
	getRawConfig: async () => {
		const row = await settingModel
			.query()
			.where("id", SETTING_ID)
			.first();

		const dbConfig = row?.meta || { providers: [] };
		const dbProviders = (dbConfig.providers || []).map((p) => ({ ...p, _source: "db" }));

		// File-sourced providers (already have _source: "file")
		const fileProviders = getFileProviders();
		const fileIds = new Set(fileProviders.map((p) => p.id));

		// Merge: file wins on ID conflict
		const mergedDb = dbProviders.filter((p) => {
			if (fileIds.has(p.id)) {
				logger.warn(`OIDC provider "${p.id}" exists in both DB and file config — file config takes precedence`);
				return false;
			}
			return true;
		});

		return { providers: [...fileProviders, ...mergedDb] };
	},

	/**
	 * Get the list of enabled providers for the login page (public-safe, no secrets).
	 *
	 * @returns {Promise<Array<{id: string, name: string, source: string}>>}
	 */
	getEnabledProviders: async () => {
		const config = await internalOidc.getRawConfig();
		return (config.providers || [])
			.filter((p) => p.enabled)
			.map((p) => ({ id: p.id, name: p.name, source: p._source || "db" }));
	},

	/**
	 * Get OIDC configuration (admin-only). Redacts client secrets.
	 *
	 * @param {Access} access
	 * @returns {Promise<{providers: Array}>}
	 */
	getConfig: async (access) => {
		await access.can("settings:get");

		const config = await internalOidc.getRawConfig();
		const providers = (config.providers || []).map((p) => ({
			...p,
			// Expose source to the frontend (strip internal underscore-prefixed field)
			source: p._source || "db",
			_source: undefined,
			// Redact client secret - replace with placeholder if set
			client_secret: p.client_secret ? "••••••••" : "",
		}));

		return { providers };
	},

	/**
	 * Save OIDC configuration (admin-only).
	 * Encrypts client secrets, validates discovery URLs.
	 *
	 * @param {Access} access
	 * @param {Object} data
	 * @returns {Promise<{providers: Array}>}
	 */
	saveConfig: async (access, data) => {
		await access.can("settings:update");

		const existingConfig = await internalOidc.getRawConfig();
		const existingProviders = existingConfig.providers || [];

		// Identify file-sourced provider IDs — these cannot be modified via the API
		const fileProviderIds = new Set(getFileProviders().map((p) => p.id));

		const providers = [];
		for (const provider of (data.providers || [])) {
			// Skip file-sourced providers silently — they are read-only
			if (fileProviderIds.has(provider.id)) {
				logger.warn(`OIDC saveConfig: ignoring attempt to modify file-sourced provider "${provider.id}" via API`);
				continue;
			}

			// Enforce HTTPS on all discovery URLs
			enforceHttps(provider.discovery_url);

			// Determine the client secret to store:
			// - If the incoming value is the redaction placeholder or empty, keep existing
			// - Otherwise encrypt the new value
			let clientSecret = provider.client_secret;
			if (clientSecret === "••••••••" || clientSecret === "") {
				// Keep existing encrypted secret (DB providers only at this point)
				const existing = existingProviders.find((p) => p.id === provider.id && p._source !== "file");
				clientSecret = existing ? existing.client_secret : "";
			} else {
				// Encrypt the new plaintext secret
				clientSecret = encryptSecret(clientSecret);
			}

			// Validate by attempting discovery (uses the decrypted secret)
			const decryptedSecret = clientSecret ? decryptSecret(clientSecret) : "";
			try {
				enforceHttps(provider.discovery_url);
				const testConfig = {
					discovery_url: provider.discovery_url,
					client_id: provider.client_id,
					client_secret: decryptedSecret,
				};
				// Invalidate cache so we get a fresh discovery
				discoveryCache.delete(provider.discovery_url);
				await discoverProvider(testConfig);
			} catch (err) {
				throw new errs.ConfigurationError(`OIDC provider "${provider.name}" validation failed: ${err.message}`);
			}

			providers.push({
				id: provider.id,
				name: provider.name,
				discovery_url: provider.discovery_url,
				client_id: provider.client_id,
				client_secret: clientSecret,
				scopes: provider.scopes || "openid email profile",
				enabled: provider.enabled,
				use_par: provider.use_par || false,
				auto_provision: provider.auto_provision || false,
				auto_provision_role: "user", // Always "user" — never "admin"
				claim_mapping: provider.claim_mapping || {
					email: "email",
					name: "name",
					nickname: "preferred_username",
					avatar: "picture",
				},
			});
		}

		const newMeta = { providers };

		// Check if setting row exists
		const existing = await settingModel.query().where("id", SETTING_ID).first();
		if (existing) {
			await settingModel.query().where("id", SETTING_ID).patch({ meta: newMeta });
		} else {
			await settingModel.query().insert({
				id: SETTING_ID,
				name: "OIDC Configuration",
				description: "OpenID Connect provider configuration",
				value: "enabled",
				meta: newMeta,
			});
		}

		// Determine per-provider changes for audit logging (DB providers only)
		const existingDbProviders = existingProviders.filter((p) => p._source !== "file");
		const existingIds = new Set(existingDbProviders.map((p) => p.id));
		const newIds = new Set(providers.map((p) => p.id));

		const added = providers.filter((p) => !existingIds.has(p.id));
		const removed = existingDbProviders.filter((p) => !newIds.has(p.id));
		const updated = providers.filter((p) => {
			if (!existingIds.has(p.id)) return false;
			const prev = existingDbProviders.find((ep) => ep.id === p.id);
			if (!prev) return false;
			// Compare non-secret fields
			return (
				prev.name !== p.name ||
				prev.discovery_url !== p.discovery_url ||
				prev.client_id !== p.client_id ||
				prev.client_secret !== p.client_secret ||
				prev.scopes !== p.scopes ||
				prev.enabled !== p.enabled ||
				prev.use_par !== p.use_par ||
				prev.auto_provision !== p.auto_provision ||
				JSON.stringify(prev.claim_mapping) !== JSON.stringify(p.claim_mapping)
			);
		});

		const providerSummary = (p) => ({
			id: p.id,
			name: p.name,
			enabled: p.enabled,
			discovery_url: p.discovery_url,
			client_id: p.client_id,
			scopes: p.scopes,
			use_par: p.use_par,
			auto_provision: p.auto_provision,
			claim_mapping: p.claim_mapping,
		});

		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "setting",
			object_id: 0,
			meta: {
				name: "OIDC Configuration",
				provider_count: providers.length,
				added: added.map(providerSummary),
				updated: updated.map(providerSummary),
				removed: removed.map((p) => ({ id: p.id, name: p.name })),
			},
		});

		return internalOidc.getConfig(access);
	},

	/**
	 * Build an OIDC authorization URL for the given provider.
	 * Generates PKCE code_verifier and stores it in a signed state JWT.
	 *
	 * @param {string} providerId
	 * @param {string} callbackUrl - Full callback URL (e.g. https://app.example.com/api/oidc/callback)
	 * @returns {Promise<{authorizeUrl: string, stateToken: string}>}
	 */
	buildAuthorizationUrl: async (providerId, callbackUrl) => {
		const config = await internalOidc.getRawConfig();
		const providerConfig = (config.providers || []).find((p) => p.id === providerId && p.enabled);

		if (!providerConfig) {
			throw new errs.ItemNotFoundError(`OIDC provider "${providerId}" not found or not enabled`);
		}

		const decryptedSecret = getPlaintextSecret(providerConfig);
		const providerConfigWithSecret = { ...providerConfig, client_secret: decryptedSecret };

		const oidcConfig = await discoverProvider(providerConfigWithSecret);

		// Generate PKCE values (RFC 7636)
		const codeVerifier = oidcClient.randomPKCECodeVerifier();
		const codeChallenge = await oidcClient.calculatePKCECodeChallenge(codeVerifier);
		const nonce = oidcClient.randomNonce();

		// Create a short-lived state JWT containing the PKCE verifier and nonce
		const Token = TokenModel();
		const stateJwt = await Token.create({
			iss: "api",
			attrs: {
				provider_id: providerId,
				code_verifier: codeVerifier,
				nonce: nonce,
				redirect_uri: callbackUrl,
			},
			scope: ["oidc-state"],
			expiresIn: "5m",
		});

		// Build the authorization URL with PKCE
		const scopes = (providerConfig.scopes || "openid email profile").split(" ").filter(Boolean);

		const authParams = {
			redirect_uri: callbackUrl,
			scope: scopes.join(" "),
			state: stateJwt.token,
			nonce: nonce,
			code_challenge: codeChallenge,
			code_challenge_method: "S256",
		};

		let authorizeUrl;
		if (providerConfig.use_par) {
			// Pushed Authorization Request (RFC 9126) — sends params server-side
			debug(logger, `Using PAR for provider ${providerId}`);
			try {
				authorizeUrl = await oidcClient.buildAuthorizationUrlWithPAR(oidcConfig, authParams);
			} catch (err) {
				logger.error(`PAR request failed for provider ${providerId}: ${err.message}`);
				if (err.cause) {
					logger.error(`  cause: ${JSON.stringify(err.cause)}`);
				}
				if (err.code) {
					logger.error(`  error_code: ${err.code}`);
				}

				// Build a user-friendly message from the provider's OAuth error response
				const detail = err.error_description || err.error || err.message;
				throw new errs.ConfigurationError(`OIDC provider "${providerId}" PAR request failed: ${detail}`);
			}
		} else {
			authorizeUrl = oidcClient.buildAuthorizationUrl(oidcConfig, authParams);
		}

		return { authorizeUrl: authorizeUrl.href };
	},

	/**
	 * Build an OIDC authorization URL for account linking.
	 * Returns the PKCE code_verifier, nonce, and a signed state JWT so the
	 * frontend can complete the link POST after the popup callback.
	 *
	 * @param {Access} access - must be authenticated
	 * @param {string} providerId
	 * @param {string} callbackUrl
	 * @returns {Promise<{authorizeUrl: string, codeVerifier: string, nonce: string, state: string}>}
	 */
	buildLinkAuthorizationUrl: async (access, providerId, callbackUrl) => {
		const userId = access.token.getUserId();
		if (!userId) {
			throw new errs.AuthError("Not authenticated");
		}

		const config = await internalOidc.getRawConfig();
		const providerConfig = (config.providers || []).find((p) => p.id === providerId && p.enabled);
		if (!providerConfig) {
			throw new errs.ItemNotFoundError(`OIDC provider "${providerId}" not found or not enabled`);
		}

		const decryptedSecret = getPlaintextSecret(providerConfig);
		const providerConfigWithSecret = { ...providerConfig, client_secret: decryptedSecret };
		const oidcConfig = await discoverProvider(providerConfigWithSecret);

		const codeVerifier = oidcClient.randomPKCECodeVerifier();
		const codeChallenge = await oidcClient.calculatePKCECodeChallenge(codeVerifier);
		const nonce = oidcClient.randomNonce();

		// Create a short-lived state JWT for CSRF protection (mirrors login flow)
		const Token = TokenModel();
		const stateJwt = await Token.create({
			iss: "api",
			attrs: {
				provider_id: providerId,
				redirect_uri: callbackUrl,
			},
			scope: ["oidc-link-state"],
			expiresIn: "5m",
		});

		const scopes = (providerConfig.scopes || "openid email profile").split(" ").filter(Boolean);

		const authParams = {
			redirect_uri: callbackUrl,
			scope: scopes.join(" "),
			state: stateJwt.token,
			nonce: nonce,
			code_challenge: codeChallenge,
			code_challenge_method: "S256",
		};

		let authorizeUrl;
		if (providerConfig.use_par) {
			authorizeUrl = await oidcClient.buildAuthorizationUrlWithPAR(oidcConfig, authParams);
		} else {
			authorizeUrl = oidcClient.buildAuthorizationUrl(oidcConfig, authParams);
		}

		return {
			authorizeUrl: authorizeUrl.href,
			codeVerifier,
			nonce,
			state: stateJwt.token,
		};
	},

	/**
	 * Handle the OIDC callback — exchange code for tokens, resolve user, issue NPM JWT.
	 *
	 * The full redirect URL from the browser (with all query params including code,
	 * state, iss, session_state etc.) is passed through to openid-client so it can
	 * perform proper RFC 9207 issuer validation.
	 *
	 * @param {string} stateToken - State JWT from our authorize request (extracted from query)
	 * @param {string} currentUrl - The full URL the browser was redirected to
	 * @returns {Promise<{token: string, expires: string} | {requires_2fa: true, challenge_token: string}>}
	 */
	handleCallback: async (stateToken, currentUrl) => {
		// Validate state JWT
		const Token = TokenModel();
		let stateData;
		try {
			stateData = await Token.load(stateToken);
		} catch {
			throw new errs.AuthError("OIDC login session expired. Please try again.");
		}

		if (!stateData.scope || stateData.scope[0] !== "oidc-state") {
			throw new errs.AuthError("OIDC login session expired. Please try again.");
		}

		const { provider_id: providerId, code_verifier: codeVerifier, nonce, redirect_uri: callbackUrl } = stateData.attrs || {};

		if (!providerId || !codeVerifier || !nonce || !callbackUrl) {
			throw new errs.AuthError("OIDC login session expired. Please try again.");
		}

		// Load provider config
		const config = await internalOidc.getRawConfig();
		const providerConfig = (config.providers || []).find((p) => p.id === providerId && p.enabled);

		if (!providerConfig) {
			throw new errs.AuthError("OIDC provider is no longer configured or enabled.");
		}

		const decryptedSecret = getPlaintextSecret(providerConfig);
		const providerConfigWithSecret = { ...providerConfig, client_secret: decryptedSecret };
		const oidcConfig = await discoverProvider(providerConfigWithSecret);

		// Build the URL for openid-client: use the stored redirect_uri as the base
		// but replace query params with the actual ones from the browser redirect.
		// This ensures the redirect_uri matches what was sent to the authorize endpoint
		// while preserving all provider-added params (iss, session_state, etc.)
		const incomingUrl = new URL(currentUrl);
		const tokenExchangeUrl = new URL(callbackUrl);
		tokenExchangeUrl.search = incomingUrl.search;

		// Exchange the authorization code for tokens (with PKCE verification)
		let tokens;
		try {
			tokens = await oidcClient.authorizationCodeGrant(oidcConfig, tokenExchangeUrl, {
				pkceCodeVerifier: codeVerifier,
				expectedNonce: nonce,
				expectedState: stateToken,
				idTokenExpected: true,
			});
		} catch (err) {
			logger.error(`OIDC token exchange failed: ${err.message}`);
			if (err.cause) {
				logger.error(`  cause: ${err.cause.message || err.cause}`);
			}
			if (err.response) {
				logger.error(`  response status: ${err.response.status}`);
				try {
					const body = await err.response.text();
					logger.error(`  response body: ${body}`);
				} catch { /* ignore */ }
			}
			if (err.code) {
				logger.error(`  code: ${err.code}`);
			}
			throw new errs.AuthError("OIDC authentication failed");
		}

		// Extract claims using claim mapping
		const claimMapping = providerConfig.claim_mapping || {};
		const emailClaim = claimMapping.email || "email";
		const nameClaim = claimMapping.name || "name";
		const nicknameClaim = claimMapping.nickname || "preferred_username";
		const avatarClaim = claimMapping.avatar || "picture";

		let claims = tokens.claims();
		debug(logger, `ID token claims: ${JSON.stringify(Object.keys(claims))}`);

		// Many providers only include email/profile claims in the userinfo
		// endpoint, not in the ID token itself. If the email claim is missing,
		// fetch userinfo and merge the additional claims.
		if (!claims[emailClaim] && tokens.access_token) {
			debug(logger, "Email claim missing from ID token, fetching userinfo endpoint");
			try {
				const userInfo = await oidcClient.fetchUserInfo(oidcConfig, tokens.access_token, claims.sub);
				debug(logger, `Userinfo claims: ${JSON.stringify(Object.keys(userInfo))}`);
				// Merge userinfo into claims (ID token claims take precedence)
				claims = { ...userInfo, ...claims };
			} catch (err) {
				logger.warn(`Failed to fetch userinfo endpoint: ${err.message}`);
			}
		}

		const sub = claims.sub;
		const email = claims[emailClaim];
		const name = claims[nameClaim] || email;
		const nickname = claims[nicknameClaim] || email?.split("@")[0] || "user";
		const avatar = claims[avatarClaim] || gravatar.url(email || "unknown@example.com", { default: "mm" });

		if (!sub) {
			throw new errs.AuthError("OIDC provider did not return a subject identifier");
		}

		if (!email) {
			throw new errs.AuthError("OIDC provider did not return an email address. Ensure the 'email' scope is configured.");
		}

		// Resolve or provision the local user
		const user = await internalOidc.resolveUser(
			{ sub, email, name, nickname, avatar, provider_id: providerId },
			providerConfig,
		);

		// Check 2FA (don't bypass it for OIDC users)
		const has2FA = await twoFactor.isEnabled(user.id);
		if (has2FA) {
			const challengeToken = await Token.create({
				iss: "api",
				attrs: { id: user.id },
				scope: ["2fa-challenge"],
				expiresIn: "5m",
			});

			return {
				requires_2fa: true,
				challenge_token: challengeToken.token,
			};
		}

		// Update last login in auth meta
		const oidcAuthRecords = await authModel
			.query()
			.where("user_id", user.id)
			.where("type", "oidc");

		const oidcAuth = oidcAuthRecords.find(
			(r) => r.meta && r.meta.provider_id === providerId,
		);

		if (oidcAuth) {
			await authModel
				.query()
				.where("id", oidcAuth.id)
				.patch({ meta: { ...oidcAuth.meta, provider_id: providerId, issuer: claims.iss, last_login: new Date().toISOString() } });
		}

		const result = await internalToken.getTokenFromUser(user);
		// Annotate with oidc provider info for logout support
		result.oidc_provider = providerId;
		return result;
	},

	/**
	 * Resolve a local user from OIDC claims.
	 * SECURITY: No unauthenticated email-based account linking.
	 * Only matches by (type='oidc', sub, provider_id) or auto-provisions a NEW user.
	 *
	 * @param {Object} claims - { sub, email, name, nickname, avatar, provider_id }
	 * @param {Object} providerConfig
	 * @returns {Promise<Object>} local user
	 */
	resolveUser: async (claims, providerConfig) => {
		// Look for existing OIDC auth record matching sub + provider
		// Query all OIDC auth records for this sub, then match provider_id.
		// A sub claim is only unique per issuer, so we must match provider_id too.
		const authRecords = await authModel
			.query()
			.where("type", "oidc")
			.where("secret", claims.sub);

		const authRecord = authRecords.find(
			(r) => r.meta && r.meta.provider_id === claims.provider_id,
		);

		if (authRecord) {
			const user = await userModel
				.query()
				.where("id", authRecord.user_id)
				.first();

			if (user && user.is_disabled) {
				throw new errs.AuthError("Account is disabled");
			}

			if (user && !user.is_deleted) {
				return user;
			}

			// User was deleted — remove the stale OIDC auth record so the
			// identity can be re-provisioned as a new account below.
			logger.info(`Removing stale OIDC auth record for deleted user_id=${authRecord.user_id}`);
			await authModel.query().deleteById(authRecord.id);
		}

		// No existing OIDC link found — check auto-provisioning
		if (!providerConfig.auto_provision) {
			throw new errs.AuthError("No account exists for this OIDC identity. Contact your administrator.");
		}

		// Auto-provision a NEW user (never link to existing accounts based on email)
		logger.info(`Auto-provisioning new user for OIDC subject: ${claims.sub} from provider: ${claims.provider_id}`);

		const newUser = await userModel.query().insertAndFetch({
			email: claims.email,
			name: claims.name || claims.email,
			nickname: claims.nickname || claims.email.split("@")[0],
			avatar: claims.avatar || gravatar.url(claims.email, { default: "mm" }),
			roles: [], // Standard user — NEVER "admin" (security guardrail)
			is_deleted: 0,
			is_disabled: 0,
		});

		await authModel.query().insert({
			user_id: newUser.id,
			type: "oidc",
			secret: claims.sub,
			meta: {
				provider_id: claims.provider_id,
				issuer: "",
				last_login: new Date().toISOString(),
			},
		});

		await userPermissionModel.query().insert({
			user_id: newUser.id,
			visibility: "user",
			proxy_hosts: "manage",
			redirection_hosts: "manage",
			dead_hosts: "manage",
			streams: "manage",
			access_lists: "manage",
			certificates: "manage",
		});

		// Audit log with internal access
		const internalAccess = new Access(null);
		await internalAccess.load(true);

		await internalAuditLog.add(internalAccess, {
			action: "created",
			object_type: "user",
			object_id: newUser.id,
			user_id: newUser.id,
			meta: {
				...newUser,
				oidc_provider_id: claims.provider_id,
			},
		});

		return newUser;
	},

	/**
	 * Link an OIDC identity to an already-authenticated user.
	 * This is the ONLY way to link OIDC to an existing account.
	 * Requires: valid NPM JWT (authenticated user).
	 *
	 * @param {Access} access - authenticated user's access context
	 * @param {string} providerId
	 * @param {string} codeVerifier - PKCE code verifier
	 * @param {string} nonce - Nonce used in the authorization request
	 * @param {string} callbackUrl - redirect_uri used in the authorization request
	 * @param {string} state - State JWT from the authorize-link request (CSRF protection)
	 * @param {string} queryString - Full IdP callback query string for RFC 9207 validation
	 * @returns {Promise<void>}
	 */
	linkOidcIdentity: async (access, providerId, codeVerifier, nonce, callbackUrl, state, queryString) => {
		const userId = access.token.getUserId();
		if (!userId) {
			throw new errs.AuthError("Not authenticated");
		}

		if (!state) {
			throw new errs.AuthError("Missing state parameter for OIDC link request");
		}

		// Validate state JWT (CSRF protection for link flow)
		const Token = TokenModel();
		let stateData;
		try {
			stateData = await Token.load(state);
		} catch {
			throw new errs.AuthError("OIDC link session expired. Please try again.");
		}
		if (!stateData.scope || stateData.scope[0] !== "oidc-link-state") {
			throw new errs.AuthError("OIDC link session expired. Please try again.");
		}
		const attrs = stateData.attrs || {};
		if (attrs.provider_id !== providerId) {
			throw new errs.AuthError("OIDC link state does not match provider");
		}
		if (attrs.redirect_uri !== callbackUrl) {
			throw new errs.AuthError("OIDC link state does not match callback URL");
		}

		const config = await internalOidc.getRawConfig();
		const providerConfig = (config.providers || []).find((p) => p.id === providerId && p.enabled);

		if (!providerConfig) {
			throw new errs.ItemNotFoundError(`OIDC provider "${providerId}" not found`);
		}

		const decryptedSecret = getPlaintextSecret(providerConfig);
		const providerConfigWithSecret = { ...providerConfig, client_secret: decryptedSecret };
		const oidcConfig = await discoverProvider(providerConfigWithSecret);

		// Exchange code for tokens using PKCE + nonce validation.
		// Reconstruct the full callback URL the same way the login flow does:
		// use the stored redirect_uri as the base and attach the original query
		// params from the IdP redirect (code, state, iss, session_state, etc.)
		// so openid-client can perform proper RFC 9207 issuer validation.
		const tokenExchangeUrl = new URL(callbackUrl);
		if (queryString) {
			tokenExchangeUrl.search = queryString;
		}
		let tokens;
		try {
			const grantOptions = {
				pkceCodeVerifier: codeVerifier,
				expectedNonce: nonce,
				expectedState: state,
				idTokenExpected: true,
			};
			tokens = await oidcClient.authorizationCodeGrant(oidcConfig, tokenExchangeUrl, grantOptions);
		} catch (err) {
			logger.error(`OIDC link code exchange failed: ${err.message || err}`);
			throw new errs.AuthError("OIDC code exchange failed during account linking");
		}

		const claims = tokens.claims();
		const sub = claims.sub;

		if (!sub) {
			throw new errs.AuthError("OIDC provider did not return a subject identifier");
		}

		// Check if this OIDC identity is already linked to another user
		// Query all records for this sub and match provider_id in application code
		const existingAuthRecords = await authModel
			.query()
			.where("type", "oidc")
			.where("secret", sub);

		const existingAuth = existingAuthRecords.find(
			(r) => r.meta && r.meta.provider_id === providerId,
		);

		if (existingAuth) {
			if (existingAuth.user_id === userId) {
				throw new errs.ValidationError("This OIDC identity is already linked to your account");
			}
			throw new errs.ValidationError("This OIDC identity is already linked to another account");
		}

		// Create the auth record linking current user to OIDC identity
		await authModel.query().insert({
			user_id: userId,
			type: "oidc",
			secret: sub,
			meta: {
				provider_id: providerId,
				issuer: claims.iss || "",
				last_login: new Date().toISOString(),
			},
		});

		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "user",
			object_id: userId,
			user_id: userId,
			meta: {
				name: (await userModel.query().findById(userId))?.name || `User #${userId}`,
				provider_id: providerId,
				provider_name: providerConfig.name || providerId,
				oidc_action: "link",
			},
		});
	},

	/**
	 * Get the OIDC identities linked to a user.
	 * @param {number} userId
	 * @returns {Promise<Array<{provider_id: string, provider_name: string, linked_on: string}>>}
	 */
	getUserIdentities: async (userId) => {
		const authRecords = await authModel
			.query()
			.where("user_id", userId)
			.where("type", "oidc");

		const config = await internalOidc.getRawConfig();
		const providers = config.providers || [];

		return authRecords.map((record) => {
			const providerId = record.meta?.provider_id || "unknown";
			const providerConfig = providers.find((p) => p.id === providerId);
			return {
				provider_id: providerId,
				provider_name: providerConfig?.name || providerId,
				linked_on: record.created_on,
			};
		});
	},

	/**
	 * Unlink an OIDC identity from a user.
	 * Safety: refuses if this is the user's only auth method.
	 *
	 * @param {Access} access
	 * @param {string} providerId
	 * @returns {Promise<void>}
	 */
	unlinkOidcIdentity: async (access, providerId) => {
		const userId = access.token.getUserId();
		if (!userId) {
			throw new errs.AuthError("Not authenticated");
		}

		// Find the OIDC auth record for this provider
		const oidcAuthRecords = await authModel
			.query()
			.where("user_id", userId)
			.where("type", "oidc");

		const targetRecord = oidcAuthRecords.find(
			(r) => r.meta && r.meta.provider_id === providerId,
		);

		if (!targetRecord) {
			throw new errs.ItemNotFoundError(
				`No OIDC identity linked for provider "${providerId}"`,
			);
		}

		// Safety check: user must have at least one other auth method.
		// NOTE: This is a TOCTOU check — two concurrent unlink requests for
		// different providers could both pass before either delete completes,
		// leaving the user with zero auth methods. This is low-severity (self-DoS
		// only, requires precise timing with exactly 2 remaining methods) and the
		// codebase does not currently use database transactions. If this becomes a
		// concern, wrap the count check + delete in a serializable transaction.
		const allAuthRecords = await authModel
			.query()
			.where("user_id", userId);

		if (allAuthRecords.length <= 1) {
			throw new errs.ValidationError(
				"Cannot unlink your only authentication method. You would be locked out.",
			);
		}

		// Delete the auth record
		await authModel.query().deleteById(targetRecord.id);

		// Fetch user name and provider name for the audit log
		const user = await userModel.query().findById(userId);
		const config = await internalOidc.getRawConfig();
		const provider = (config.providers || []).find((p) => p.id === providerId);

		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "user",
			object_id: userId,
			user_id: userId,
			meta: {
				name: user?.name || `User #${userId}`,
				provider_id: providerId,
				provider_name: provider?.name || providerId,
				oidc_action: "unlink",
			},
		});
	},

	/**
	 * Count users linked to a specific OIDC provider.
	 * Admin-only.
	 *
	 * @param {Access} access
	 * @param {string} providerId
	 * @returns {Promise<{total: number, oidc_only: number}>}
	 */
	getProviderUserCount: async (access, providerId) => {
		await access.can("settings:update");

		// Get all OIDC auth records, filter by provider_id in meta
		const oidcAuthRecords = await authModel
			.query()
			.where("type", "oidc");

		const providerRecords = oidcAuthRecords.filter(
			(r) => r.meta && r.meta.provider_id === providerId,
		);

		const userIds = [...new Set(providerRecords.map((r) => r.user_id))];

		if (userIds.length === 0) {
			return { total: 0, oidc_only: 0 };
		}

		// For each user, check if they have ANY other auth method
		const allAuthRecords = await authModel
			.query()
			.whereIn("user_id", userIds);

		let oidcOnlyCount = 0;
		for (const userId of userIds) {
			const userAuths = allAuthRecords.filter((r) => r.user_id === userId);
			const nonProviderAuths = userAuths.filter(
				(r) => !(r.type === "oidc" && r.meta?.provider_id === providerId),
			);
			if (nonProviderAuths.length === 0) {
				oidcOnlyCount++;
			}
		}

		return { total: userIds.length, oidc_only: oidcOnlyCount };
	},

	/**
	 * Get the RP-initiated logout URL for a provider (if supported).
	 *
	 * @param {string} providerId
	 * @param {string} postLogoutRedirectUri
	 * @returns {Promise<string|null>} logout URL or null if not supported
	 */
	getLogoutUrl: async (providerId, postLogoutRedirectUri) => {
		const config = await internalOidc.getRawConfig();
		const providerConfig = (config.providers || []).find((p) => p.id === providerId && p.enabled);

		if (!providerConfig) {
			return null;
		}

		const decryptedSecret = getPlaintextSecret(providerConfig);
		const providerConfigWithSecret = { ...providerConfig, client_secret: decryptedSecret };

		let oidcConfig;
		try {
			oidcConfig = await discoverProvider(providerConfigWithSecret);
		} catch {
			return null;
		}

		try {
			const logoutUrl = oidcClient.buildEndSessionUrl(oidcConfig, {
				post_logout_redirect_uri: postLogoutRedirectUri,
			});
			return logoutUrl.href;
		} catch {
			// Provider doesn't support RP-initiated logout
			return null;
		}
	},

	/**
	 * Test OIDC provider connectivity by attempting discovery.
	 * Admin-only. Does not modify any stored configuration.
	 *
	 * @param {Access} access
	 * @param {Object} data
	 * @param {string} data.discovery_url
	 * @param {string} data.client_id
	 * @param {string} data.client_secret - plaintext or redaction placeholder
	 * @param {string} [data.provider_id] - if provided and secret is placeholder, look up existing
	 * @returns {Promise<{success: boolean}>}
	 */
	testConnection: async (access, data) => {
		await access.can("settings:update");
		enforceHttps(data.discovery_url);

		// Resolve client secret: if it's the redaction placeholder, look up the existing secret
		// (handles both DB-encrypted and file-sourced plaintext secrets)
		let clientSecret = data.client_secret || "";
		if (clientSecret === "••••••••") {
			if (data.provider_id) {
				const existingConfig = await internalOidc.getRawConfig();
				const existing = (existingConfig.providers || []).find((p) => p.id === data.provider_id);
				clientSecret = existing ? getPlaintextSecret(existing) : "";
			} else {
				clientSecret = "";
			}
		}

		// Bust the cache so we get a fresh discovery attempt
		discoveryCache.delete(data.discovery_url);

		const oidcConfig = await discoverProvider({
			discovery_url: data.discovery_url,
			client_id: data.client_id,
			client_secret: clientSecret,
		});

		// Step 2: Validate credentials and scopes using PAR (Pushed Authorization Request).
		// PAR sends all auth parameters (client credentials, scopes, redirect_uri, PKCE)
		// to the provider's token endpoint server-side. The provider validates everything
		// and returns a request_uri — or an error with specific details.
		// This mirrors the real authorization_code + PKCE flow without requiring a browser.
		const scopes = (data.scopes || "openid email profile").split(" ").filter(Boolean);
		const metadata = oidcConfig.serverMetadata();
		const hasPar = !!metadata.pushed_authorization_request_endpoint;

		let credentials = "unsupported";
		let credentialsMessage = "";
		let scopesValid = true;
		let unsupportedScopes = [];

		if (hasPar) {
			// PAR validates credentials + scopes + redirect_uri in one round-trip
			const codeVerifier = oidcClient.randomPKCECodeVerifier();
			const codeChallenge = await oidcClient.calculatePKCECodeChallenge(codeVerifier);

			try {
				await oidcClient.buildAuthorizationUrlWithPAR(oidcConfig, {
					redirect_uri: `${data.callback_base_url || "https://localhost"}/api/oidc/callback`,
					scope: scopes.join(" "),
					code_challenge: codeChallenge,
					code_challenge_method: "S256",
					state: "npm-connection-test",
					nonce: oidcClient.randomNonce(),
				});
				// PAR succeeded — credentials and scopes are all valid
				credentials = "valid";
			} catch (err) {
				const oauthError = err.error || "";
				const oauthDesc = err.error_description || err.message || "";

				if (oauthError === "invalid_client") {
					credentials = "invalid";
					credentialsMessage = oauthDesc || "Invalid client credentials";
				} else if (oauthError === "invalid_scope") {
					// Credentials are valid (provider authenticated us), but scopes are wrong
					credentials = "valid";
					scopesValid = false;
					credentialsMessage = oauthDesc || "One or more scopes are not allowed";
				} else if (oauthError === "invalid_redirect_uri") {
					// Credentials and scopes are valid, redirect_uri isn't registered.
					// This is expected during test — the real callback URL may not be configured yet.
					credentials = "valid";
				} else {
					credentials = "invalid";
					credentialsMessage = oauthDesc || oauthError || err.message;
				}
				debug(logger, `PAR test result for ${data.discovery_url}: error=${oauthError} desc=${oauthDesc}`);
			}
		} else {
			// No PAR endpoint — can't validate credentials server-side.
			credentials = "unsupported";
			credentialsMessage = "Provider does not support Pushed Authorization Requests. Credentials will be validated during user login.";
			debug(logger, `No PAR endpoint for ${data.discovery_url}, skipping credential validation`);
		}

		// Step 3: Check scopes against the discovery document's scopes_supported (advisory).
		// This is informational even if PAR already validated scopes, and is the only
		// scope check available when PAR is not supported.
		if (metadata.scopes_supported && Array.isArray(metadata.scopes_supported)) {
			unsupportedScopes = scopes.filter((s) => !metadata.scopes_supported.includes(s));
			if (unsupportedScopes.length > 0) {
				scopesValid = false;
			}
		}

		return {
			success: true,
			credentials,
			credentials_message: credentialsMessage,
			scopes_valid: scopesValid,
			unsupported_scopes: unsupportedScopes,
		};
	},
};

// Audit log file-sourced providers once per process lifetime (no user context = system action)
let fileConfigAuditLogged = false;

/**
 * Log file-sourced OIDC providers to the audit log at startup.
 * Safe to call multiple times — only logs once per process.
 */
async function logFileConfigAudit() {
	if (fileConfigAuditLogged) {
		return;
	}
	fileConfigAuditLogged = true;

	const fileProviders = getFileProviders();
	if (fileProviders.length === 0) {
		return;
	}

	try {
		await internalAuditLog.add(
			{ token: { getUserId: () => 0 } },
			{
				user_id: 0,
				action: "loaded",
				object_type: "setting",
				object_id: 0,
				meta: {
					name: "OIDC File Configuration",
					source: "file",
					providers: fileProviders.map((p) => ({ id: p.id, name: p.name })),
				},
			},
		);
	} catch (err) {
		// Non-fatal — audit logging should not prevent startup
		logger.warn(`OIDC file config: could not write audit log entry: ${err.message}`);
	}
}

export { logFileConfigAudit };
export default internalOidc;
