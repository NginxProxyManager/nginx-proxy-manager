/**
 * Pure URL normalisation / validation utilities for OIDC configuration.
 *
 * No external dependencies — safe to import in unit tests without mocking.
 * Callers that want logged warnings on invalid input should log around the
 * return value (null = invalid/absent).
 */

/**
 * Validate and normalise an external base URL string.
 * Returns the canonical origin (no trailing slash) or null if invalid/absent.
 *
 * Accepted format: `http://` or `https://` followed by host (and optional port),
 * with no path, query, or fragment.  Trailing slashes are stripped before
 * validation.  Userinfo (`user@host`) is rejected.
 *
 * @param {string|undefined} raw
 * @returns {string|null}
 */
function normaliseExternalBaseUrl(raw) {
	if (!raw) {
		return null;
	}
	// Strip trailing slashes before parsing
	const trimmed = raw.replace(/\/+$/, "");
	let parsed;
	try {
		parsed = new URL(trimmed);
	} catch {
		return null;
	}
	if (!["http:", "https:"].includes(parsed.protocol)) {
		return null;
	}
	// Must not have a path component, query string, or hash fragment
	if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
		return null;
	}
	// Must not contain userinfo (e.g. user@host — open-redirect / confusion risk)
	if (parsed.username || parsed.password) {
		return null;
	}
	// Return clean origin without trailing slash
	return `${parsed.protocol}//${parsed.host}`;
}

export { normaliseExternalBaseUrl };
