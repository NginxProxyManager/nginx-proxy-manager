/**
 * OIDC origin resolution utility.
 *
 * No external dependencies — safe to import in unit tests without mocking.
 * Extracted from backend/routes/oidc.js so it can be independently tested.
 */

/**
 * Extract the public-facing origin (protocol + host + port) from the request.
 * Handles reverse-proxy scenarios where nginx strips the port from the Host header.
 *
 * Priority: externalBaseUrl (configured) > Origin header (AJAX) > X-Forwarded-Host > Host header with X-Forwarded-Port.
 *
 * @param {import('express').Request} req
 * @param {string|null} [externalBaseUrl] - Configured external base URL (from env var or DB setting)
 * @returns {string}
 */
function getOrigin(req, externalBaseUrl) {
	// Configured external base URL takes highest precedence
	if (externalBaseUrl) {
		return externalBaseUrl;
	}

	// AJAX calls include the Origin header with the full protocol://host:port
	if (req.headers.origin) {
		return req.headers.origin;
	}

	const proto = req.headers["x-forwarded-proto"] || req.protocol;

	// X-Forwarded-Host typically preserves the original Host header including port
	if (req.headers["x-forwarded-host"]) {
		return `${proto}://${req.headers["x-forwarded-host"]}`;
	}

	// Fallback: use Host header, appending X-Forwarded-Port if the port was stripped
	let host = req.get("host") || req.hostname;
	const fwdPort = req.headers["x-forwarded-port"];
	if (fwdPort && !host.includes(":")) {
		const isDefault = (proto === "https" && fwdPort === "443") || (proto === "http" && fwdPort === "80");
		if (!isDefault) {
			host = `${host}:${fwdPort}`;
		}
	}

	return `${proto}://${host}`;
}

export { getOrigin };
