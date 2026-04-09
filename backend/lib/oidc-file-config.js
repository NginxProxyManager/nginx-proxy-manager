import fs from "node:fs";
import { oidc as logger } from "../logger.js";

// Regex: only expand ${OIDC_*} references — prevents leaking DB passwords, etc.
const SAFE_ENV_VAR_RE = /\$\{(OIDC_[A-Z0-9_]+)\}/g;

/**
 * Validate that a URL uses HTTPS (mirrors enforceHttps in internal/oidc.js).
 * Kept local to avoid a circular dependency: oidc.js → oidc-file-config.js → oidc.js.
 *
 * @param {string} url
 * @returns {boolean}
 */
function isHttps(url) {
	return typeof url === "string" && url.startsWith("https://");
}

/**
 * Expand ${OIDC_*} placeholders in a string using process.env.
 * Non-OIDC_ prefixed vars are NOT expanded (security: prevent exfiltration of
 * DB passwords, tokens, etc. that may be present in the environment).
 *
 * @param {string} value
 * @returns {string}
 */
function expandEnvVars(value) {
	if (typeof value !== "string") {
		return value;
	}
	return value.replace(SAFE_ENV_VAR_RE, (match, varName) => {
		const resolved = process.env[varName];
		if (resolved === undefined) {
			logger.warn(`OIDC file config: referenced env var "${varName}" is not set — using empty string`);
			return "";
		}
		return resolved;
	});
}

/**
 * Validate a single provider object.
 * Returns an array of validation error strings (empty = valid).
 *
 * @param {Object} provider
 * @returns {string[]}
 */
function validateProvider(provider) {
	const errors = [];
	if (!provider.id || typeof provider.id !== "string") {
		errors.push("missing or invalid 'id'");
	}
	if (!provider.name || typeof provider.name !== "string") {
		errors.push("missing or invalid 'name'");
	}
	if (!provider.discovery_url || typeof provider.discovery_url !== "string") {
		errors.push("missing or invalid 'discovery_url'");
	} else if (!isHttps(provider.discovery_url)) {
		errors.push(`'discovery_url' must use HTTPS (got: ${provider.discovery_url})`);
	}
	if (!provider.client_id || typeof provider.client_id !== "string") {
		errors.push("missing or invalid 'client_id'");
	}
	return errors;
}

/**
 * Load providers from a JSON config file.
 * Invalid providers are skipped with a warning (fail-open for partial config).
 *
 * @param {string} filePath
 * @returns {Object[]} array of validated, env-var-expanded provider objects with _source: "file"
 */
function loadFromFile(filePath) {
	let parsed;
	try {
		const raw = fs.readFileSync(filePath, "utf8");
		parsed = JSON.parse(raw);
	} catch (err) {
		logger.error(`OIDC file config: failed to parse config file "${filePath}": ${err.message}`);
		return [];
	}

	if (!parsed || !Array.isArray(parsed.providers)) {
		logger.error(`OIDC file config: config file "${filePath}" must have a top-level "providers" array`);
		return [];
	}

	const result = [];
	for (const rawProvider of parsed.providers) {
		// Expand ${OIDC_*} env vars in client_secret (and any other string fields)
		const provider = {
			...rawProvider,
			client_secret: expandEnvVars(rawProvider.client_secret || ""),
		};

		const errors = validateProvider(provider);
		if (errors.length > 0) {
			logger.warn(`OIDC file config: skipping provider "${provider.id || "(no id)"}" — ${errors.join("; ")}`);
			continue;
		}

		// Enforce auto_provision_role can never be "admin" from file config
		if (provider.auto_provision_role && provider.auto_provision_role !== "user") {
			logger.warn(`OIDC file config: provider "${provider.id}" has auto_provision_role="${provider.auto_provision_role}" — forced to "user"`);
		}

		result.push({
			id: provider.id,
			name: provider.name,
			discovery_url: provider.discovery_url,
			client_id: provider.client_id,
			client_secret: provider.client_secret || "",
			scopes: provider.scopes || "openid email profile",
			enabled: provider.enabled !== false, // default true
			use_par: provider.use_par || false,
			auto_provision: provider.auto_provision || false,
			auto_provision_role: "user", // Always "user" — never "admin"
			claim_mapping: provider.claim_mapping || {
				email: "email",
				name: "name",
				nickname: "preferred_username",
				avatar: "picture",
			},
			_source: "file",
		});
	}

	logger.info(`OIDC file config: loaded ${result.length} provider(s) from "${filePath}"`);
	return result;
}

/**
 * Load a single provider from OIDC_PROVIDER_* environment variables.
 * Returns an empty array if OIDC_PROVIDER_ID is not set.
 *
 * @returns {Object[]}
 */
function loadFromEnvVars() {
	const id = process.env.OIDC_PROVIDER_ID;
	if (!id) {
		return [];
	}

	const provider = {
		id,
		name: process.env.OIDC_PROVIDER_NAME || id,
		discovery_url: process.env.OIDC_PROVIDER_DISCOVERY_URL || "",
		client_id: process.env.OIDC_PROVIDER_CLIENT_ID || "",
		client_secret: process.env.OIDC_PROVIDER_CLIENT_SECRET || "",
		scopes: process.env.OIDC_PROVIDER_SCOPES || "openid email profile",
		enabled: process.env.OIDC_PROVIDER_ENABLED !== "false", // default true
		use_par: process.env.OIDC_PROVIDER_USE_PAR === "true",
		auto_provision: process.env.OIDC_PROVIDER_AUTO_PROVISION === "true",
		auto_provision_role: "user", // Always "user" — never "admin"
		claim_mapping: {
			email:    process.env.OIDC_PROVIDER_CLAIM_EMAIL    || "email",
			name:     process.env.OIDC_PROVIDER_CLAIM_NAME     || "name",
			nickname: process.env.OIDC_PROVIDER_CLAIM_NICKNAME || "preferred_username",
			avatar:   process.env.OIDC_PROVIDER_CLAIM_AVATAR   || "picture",
		},
		_source: "file",
	};

	const errors = validateProvider(provider);
	if (errors.length > 0) {
		logger.warn(`OIDC env var config: skipping OIDC_PROVIDER_* provider "${id}" — ${errors.join("; ")}`);
		return [];
	}

	logger.info(`OIDC env var config: loaded provider "${provider.name}" (${provider.id}) from OIDC_PROVIDER_* env vars`);
	return [provider];
}

// Module-level singleton — loaded once on first access (or via loadFileConfig())
let cachedProviders = null;

/**
 * Eagerly load and cache file-based OIDC providers.
 * Safe to call multiple times; only loads once per process lifetime.
 * Call this during app startup for fail-fast validation.
 */
function loadFileConfig() {
	if (cachedProviders !== null) {
		return;
	}

	const providers = [];

	// 1. File-based config — explicit path via OIDC_CONFIG_FILE, or default /data/oidc-providers.json
	const configFilePath = process.env.OIDC_CONFIG_FILE || "/data/oidc-providers.json";
	if (fs.existsSync(configFilePath)) {
		const fileProviders = loadFromFile(configFilePath);
		providers.push(...fileProviders);
	} else if (process.env.OIDC_CONFIG_FILE) {
		// Only warn if user explicitly set the path and it doesn't exist
		logger.warn(`OIDC file config: OIDC_CONFIG_FILE="${configFilePath}" not found — no file-based providers loaded`);
	}

	// 2. Single-provider env vars (OIDC_PROVIDER_*)
	// File config wins on ID conflict: only add env var provider if ID not already loaded
	const fileIds = new Set(providers.map((p) => p.id));
	const envProviders = loadFromEnvVars();
	for (const p of envProviders) {
		if (fileIds.has(p.id)) {
			logger.warn(`OIDC env var config: provider "${p.id}" already defined in file config — env var provider skipped`);
		} else {
			providers.push(p);
		}
	}

	cachedProviders = providers;
}

/**
 * Get the cached list of file-sourced OIDC providers.
 * Triggers a load on first call if not already loaded.
 *
 * @returns {Object[]}
 */
function getFileProviders() {
	if (cachedProviders === null) {
		loadFileConfig();
	}
	return cachedProviders;
}

/**
 * Reset the cached providers (for testing purposes only).
 * @internal
 */
function _resetCache() {
	cachedProviders = null;
}

export { loadFileConfig, getFileProviders, _resetCache };
