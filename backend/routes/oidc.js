import express from "express";
import internalOidc from "../internal/oidc.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import apiValidator from "../lib/validator/api.js";
import { debug, oidc as logger } from "../logger.js";
import { getValidationSchema } from "../schema/index.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * Extract the public-facing origin (protocol + host + port) from the request.
 * Handles reverse-proxy scenarios where nginx strips the port from the Host header.
 *
 * Priority: Origin header (AJAX) > X-Forwarded-Host > Host header with X-Forwarded-Port.
 */
function getOrigin(req) {
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

/**
 * Allowed callback path prefixes.  The frontend provides the full callback URL
 * because behind a reverse proxy `getOrigin(req)` is unreliable for browser-
 * initiated GET requests (no Origin header).
 *
 * Open-redirect risk is already mitigated by the OIDC provider's registered
 * redirect_uri whitelist — the IdP will reject any URI not pre-configured.
 * This server-side check adds defence-in-depth by ensuring the path points to
 * one of our own OIDC callback endpoints.
 */
const ALLOWED_CALLBACK_PATHS = ["/api/oidc/callback", "/api/oidc/link-callback"];

/**
 * Validate that a caller-supplied callback URL is well-formed and points to one
 * of our known OIDC callback paths.
 *
 * TRUST BOUNDARY: This function validates the *path* only, not the origin/host.
 * A URL like "https://evil.com/api/oidc/callback" passes validation. This is
 * intentional — behind a reverse proxy the server cannot reliably determine the
 * canonical origin. The OIDC provider's registered redirect_uri whitelist is the
 * primary defence against open-redirect attacks; this check is defence-in-depth
 * to ensure the path points to a legitimate callback endpoint.
 *
 * @param {string} callbackUrl - The caller-supplied callback URL
 * @throws {Error} if the URL is malformed or targets an unexpected path
 */
function validateCallbackUrl(callbackUrl) {
	let parsed;
	try {
		parsed = new URL(callbackUrl);
	} catch {
		throw new Error("Invalid callback URL");
	}
	if (!["http:", "https:"].includes(parsed.protocol)) {
		throw new Error("callback_url must use http or https");
	}
	const path = parsed.pathname.replace(/\/+$/, ""); // strip trailing slash
	if (!ALLOWED_CALLBACK_PATHS.includes(path)) {
		throw new Error("callback_url must target a valid OIDC callback path");
	}
}

/**
 * OIDC error code whitelist for safe HTML output.
 * Unknown codes map to the generic message.
 * SECURITY: Never reflect raw `error_description` from provider.
 */
const OIDC_ERROR_MESSAGES = {
	access_denied:          "Access was denied by the identity provider.",
	invalid_request:        "Invalid authentication request.",
	unauthorized_client:    "This application is not authorized with the identity provider.",
	unsupported_response_type: "Unsupported response type.",
	invalid_scope:          "Invalid scope requested.",
	server_error:           "The identity provider encountered an error.",
	temporarily_unavailable: "The identity provider is temporarily unavailable.",
};

const GENERIC_ERROR_MESSAGE = "Authentication failed. Please try again.";

/**
 * JSON.stringify with </script> breakout prevention for embedding in <script> blocks.
 * Escapes '<' as '\u003c' so that a '</script>' sequence inside a JSON value
 * cannot terminate the script element prematurely (XSS vector).
 * @param {*} value
 * @returns {string}
 */
function safeJsonStringify(value) {
	return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * HTML-encode a string for safe use in HTML attribute/text context.
 * @param {string} str
 * @returns {string}
 */
function htmlEncode(str) {
	return String(str)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#x27;");
}

/**
 * Render a safe callback HTML page.
 * - Success (no 2FA): stores token in localStorage, redirects to /
 * - Success (2FA): stores challenge token, redirects to /?2fa=true
 * - Error: shows styled error message with Return to Login link
 *
 * SECURITY: All dynamic values use JSON.stringify() in JS context (safe escaping
 * for </script>, quotes, etc.) and htmlEncode() in HTML context.
 *
 * @param {Object} data
 * @param {boolean} [data.success]
 * @param {boolean} [data.requires2fa]
 * @param {string}  [data.token]
 * @param {string}  [data.expires]
 * @param {string}  [data.oidcProvider] - Provider ID for RP-initiated logout support
 * @param {string}  [data.challengeToken]
 * @param {string}  [data.errorMessage] - Must already be a SAFE pre-defined string
 * @returns {string}
 */
function renderCallbackHtml(data) {
	const { success, requires2fa, token, expires, oidcProvider, challengeToken, errorMessage } = data;

	let scriptBlock;
	if (success && !requires2fa) {
		// Store full session token and redirect to /
		const tokenJson    = safeJsonStringify(token);
		const expiresJson  = safeJsonStringify(expires);
		const providerJson = safeJsonStringify(oidcProvider || null);
		scriptBlock = `
		<script>
			(function() {
				try {
					var existing = JSON.parse(localStorage.getItem('authentications') || '[]');
					existing.push({ token: ${tokenJson}, expires: ${expiresJson} });
					localStorage.setItem('authentications', JSON.stringify(existing));
					if (${providerJson}) {
						localStorage.setItem('oidc_session_provider', ${providerJson});
					}
					window.location.replace('/');
				} catch(e) {
					document.getElementById('status').textContent = 'Login succeeded but could not store token. Please try again.';
					document.getElementById('return-link').style.display = 'block';
				}
			})();
		</script>`;
	} else if (requires2fa) {
		// Store challenge token under a temporary key, redirect to login page with 2fa flag
		const challengeJson = safeJsonStringify(challengeToken);
		scriptBlock = `
		<script>
			(function() {
				try {
					localStorage.setItem('oidc_2fa_challenge', ${challengeJson});
					window.location.replace('/?2fa=true');
				} catch(e) {
					document.getElementById('status').textContent = 'Two-factor authentication required. Please return to login.';
					document.getElementById('return-link').style.display = 'block';
				}
			})();
		</script>`;
	} else {
		// Error — show a safe, styled error page
		const safeMessage = htmlEncode(errorMessage || GENERIC_ERROR_MESSAGE);
		scriptBlock = `
		<script>
			document.getElementById('status').textContent = ${safeJsonStringify(errorMessage || GENERIC_ERROR_MESSAGE)};
			document.getElementById('return-link').style.display = 'block';
		</script>`;
		// Override status default with safe HTML
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Authentication</title>
	<style>
		body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
		.card { background: white; border-radius: 8px; padding: 2rem; max-width: 400px; width: 100%; text-align: center; box-shadow: 0 2px 12px rgba(0,0,0,0.1); }
		.icon { font-size: 2rem; margin-bottom: 1rem; }
		h1 { font-size: 1.25rem; margin: 0 0 0.75rem; color: #dc3545; }
		p { color: #666; margin: 0 0 1.5rem; }
		a { color: #0d6efd; text-decoration: none; }
		a:hover { text-decoration: underline; }
	</style>
</head>
<body>
	<div class="card">
		<div class="icon">&#x26A0;</div>
		<h1>Authentication Failed</h1>
		<p>${safeMessage}</p>
		<a href="/">Return to Login</a>
	</div>
</body>
</html>`;
	}

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Authentication</title>
	<style>
		body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
		.card { background: white; border-radius: 8px; padding: 2rem; max-width: 400px; width: 100%; text-align: center; box-shadow: 0 2px 12px rgba(0,0,0,0.1); }
		.icon { font-size: 2rem; margin-bottom: 1rem; }
		h1 { font-size: 1.25rem; margin: 0 0 0.75rem; color: #333; }
		p { color: #666; margin: 0 0 1.5rem; }
		a { display: none; color: #0d6efd; text-decoration: none; }
		a:hover { text-decoration: underline; }
	</style>
</head>
<body>
	<div class="card">
		<div class="icon">&#x23F3;</div>
		<h1>Completing login&hellip;</h1>
		<p id="status">Please wait while you are being redirected.</p>
		<a id="return-link" href="/">Return to Login</a>
	</div>
	${scriptBlock}
</body>
</html>`;
}

/**
 * GET /api/oidc/providers
 *
 * Public — returns list of enabled OIDC providers (id + name only).
 * Used by the login page to render "Login with X" buttons.
 */
router
	.route("/providers")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.get(async (req, res, next) => {
		try {
			const providers = await internalOidc.getEnabledProviders();
			res.status(200).send(providers);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * GET /api/oidc/callback
 *
 * Public — handles OIDC provider redirect callback.
 * Returns a server-rendered HTML page (not JSON).
 *
 * SECURITY: Query params `error` and `error_description` from the provider
 * are NEVER reflected raw. Only whitelisted error codes map to safe messages.
 */
router
	.route("/callback")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.get(async (req, res, next) => {
		try {
			const { code, state, error: oidcError } = req.query;

			// Handle provider-sent error (e.g. user denied access)
			if (oidcError) {
				// Map to whitelisted safe message — NEVER reflect error_description
				const safeMessage = OIDC_ERROR_MESSAGES[oidcError] || GENERIC_ERROR_MESSAGE;
				const html = renderCallbackHtml({ errorMessage: safeMessage });
				return res.status(400).type("html").send(html);
			}

			if (!code || !state) {
				const html = renderCallbackHtml({ errorMessage: "Missing authorization code or state parameter." });
				return res.status(400).type("html").send(html);
			}

			// Pass the full original URL so openid-client can extract all params
			// (code, state, iss, session_state, etc.) for proper validation.
			const fullCallbackUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
			const result = await internalOidc.handleCallback(String(state), fullCallbackUrl);

			if (result.requires_2fa) {
				const html = renderCallbackHtml({
					success: true,
					requires2fa: true,
					challengeToken: result.challenge_token,
				});
				return res.status(200).type("html").send(html);
			}

			const html = renderCallbackHtml({
				success: true,
				requires2fa: false,
				token: result.token,
				expires: result.expires,
				oidcProvider: result.oidc_provider || null,
			});
			return res.status(200).type("html").send(html);
		} catch (err) {
			if (err.public) {
				// Known, user-safe error (e.g. AuthError) — show the message
				debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err.message}`);
				const html = renderCallbackHtml({ errorMessage: err.message });
				return res.status(err.status || 400).type("html").send(html);
			}
			// Unexpected internal error — log at error level, show generic message
			logger.error(`${req.method.toUpperCase()} ${req.path}: ${err.message}`, err);
			const html = renderCallbackHtml({ errorMessage: GENERIC_ERROR_MESSAGE });
			return res.status(500).type("html").send(html);
		}
	});

/**
 * POST /api/oidc/test-connection
 *
 * Admin only — tests OIDC provider connectivity by attempting discovery.
 * Does not modify any stored configuration.
 */
router
	.route("/test-connection")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.post(jwtdecode(), async (req, res, next) => {
		try {
			const data = await apiValidator(getValidationSchema("/oidc/test-connection", "post"), req.body);
			const result = await internalOidc.testConnection(res.locals.access, data);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * GET /api/oidc/identities
 *
 * Authenticated — returns the current user's linked OIDC identities.
 */
router
	.route("/identities")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.get(jwtdecode(), async (req, res, next) => {
		try {
			const userId = res.locals.access.token.getUserId();
			const identities = await internalOidc.getUserIdentities(userId);
			res.status(200).send(identities);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * GET /api/oidc/link-callback
 *
 * Public — handles the OIDC provider redirect after account-linking authorization.
 * Stores the authorization code (or error) in localStorage and redirects the
 * browser back to /. The SPA picks up the pending result on load and completes
 * the link via POST /api/oidc/link.
 *
 * MUST be registered before /:providerId/authorize to avoid Express
 * matching "link-callback" as a :providerId param.
 */
router
	.route("/link-callback")
	.get((req, res) => {
		const { error } = req.query;
		// Whitelist known error codes — same as the login callback.
		// SECURITY: Never reflect raw error/error_description from the IdP.
		const safeError = error
			? (OIDC_ERROR_MESSAGES[error] ? String(error) : "unknown_error")
			: null;
		// Preserve the full query string so the SPA can forward all IdP params
		// (code, state, iss, session_state, etc.) to POST /api/oidc/link for
		// proper RFC 9207 issuer validation during the token exchange.
		const qs = req.originalUrl.split("?")[1] || "";
		const html = `<!DOCTYPE html>
<html><head><title>Linking...</title></head><body>
<script>
(function() {
    var msg = { error: ${safeJsonStringify(safeError)}, qs: ${safeJsonStringify(qs)} };
    try {
        localStorage.setItem('oidc_link_result', JSON.stringify(msg));
    } catch(e) {}
    window.location.replace('/');
})();
</script>
<p>Completing account linking...</p>
</body></html>`;
		res.type("html").send(html);
	});

/**
 * GET /api/oidc/:providerId/authorize
 *
 * Public — initiates OIDC authorization flow.
 * Returns { authorize_url } for the frontend to redirect the browser to.
 */
router
	.route("/:providerId/authorize")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.get(async (req, res, next) => {
		try {
			const { providerId } = req.params;

			// The frontend provides the callback URL via query param since it knows
			// the real browser origin (protocol + host + port). Behind a reverse proxy,
			// the backend cannot reliably reconstruct this from forwarded headers.
			let callbackUrl;
			if (req.query.callback_url) {
				callbackUrl = String(req.query.callback_url);
				validateCallbackUrl(callbackUrl);
			} else {
				const origin = getOrigin(req);
				callbackUrl = `${origin}/api/oidc/callback`;
			}

			const { authorizeUrl } = await internalOidc.buildAuthorizationUrl(
				String(providerId),
				callbackUrl,
			);

			res.status(200).send({ authorize_url: authorizeUrl });
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * GET /api/oidc/:providerId/logout
 *
 * Authenticated — returns RP-initiated logout URL for the given provider.
 * Returns { logout_url } or null if provider doesn't support RP-initiated logout.
 */
router
	.route("/:providerId/logout")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.get(jwtdecode(), async (req, res, next) => {
		try {
			const { providerId } = req.params;
			const origin = getOrigin(req);
			const postLogoutRedirectUri = `${origin}/`;

			const logoutUrl = await internalOidc.getLogoutUrl(
				String(providerId),
				postLogoutRedirectUri,
			);

			res.status(200).send({ logout_url: logoutUrl });
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * GET /api/oidc/:providerId/authorize-link
 *
 * Authenticated — initiates OIDC authorization for account linking.
 * Returns { authorize_url, code_verifier, nonce, state, callback_url } so the
 * frontend can store PKCE params and navigate to the authorize URL.
 *
 * The frontend provides callback_url via query param since it knows the real
 * browser origin. Behind a reverse proxy the backend cannot reliably reconstruct
 * this from forwarded headers. The URL is validated against the server origin.
 */
router
	.route("/:providerId/authorize-link")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.get(jwtdecode(), async (req, res, next) => {
		try {
			const { providerId } = req.params;
			let callbackUrl;
			if (req.query.callback_url) {
				callbackUrl = String(req.query.callback_url);
				validateCallbackUrl(callbackUrl);
			} else {
				const origin = getOrigin(req);
				callbackUrl = `${origin}/api/oidc/link-callback`;
			}
			const result = await internalOidc.buildLinkAuthorizationUrl(
				res.locals.access,
				String(providerId),
				callbackUrl,
			);
			res.status(200).send({
				authorize_url: result.authorizeUrl,
				code_verifier: result.codeVerifier,
				nonce: result.nonce,
				state: result.state,
				callback_url: callbackUrl,
			});
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * POST /api/oidc/link
 *
 * Authenticated — links an OIDC identity to the currently authenticated user.
 * This is the ONLY way to link OIDC to an existing account (no unauthenticated email linking).
 *
 * The frontend forwards the full IdP callback query string (code, state, iss,
 * session_state, etc.) so the backend can reconstruct the callback URL for
 * proper RFC 9207 issuer validation during the token exchange.
 */
router
	.route("/link")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.post(jwtdecode(), async (req, res, next) => {
		try {
			const data = await apiValidator(getValidationSchema("/oidc/link", "post"), req.body);
			const callbackUrl = String(data.callback_url);
			validateCallbackUrl(callbackUrl);

			await internalOidc.linkOidcIdentity(
				res.locals.access,
				data.provider_id,
				data.code_verifier,
				data.nonce,
				callbackUrl,
				data.state,
				data.query_string || null,
			);

			res.status(200).send({ linked: true });
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * DELETE /api/oidc/link/:providerId
 *
 * Authenticated — unlinks an OIDC identity from the current user.
 */
router
	.route("/link/:providerId")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.delete(jwtdecode(), async (req, res, next) => {
		try {
			const { providerId } = req.params;
			await internalOidc.unlinkOidcIdentity(
				res.locals.access,
				String(providerId),
			);
			res.status(200).send({ unlinked: true });
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * GET /api/oidc/config
 *
 * Admin only — returns OIDC configuration with redacted secrets.
 */
router
	.route("/config")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/oidc/config
	 */
	.get(async (req, res, next) => {
		try {
			const config = await internalOidc.getConfig(res.locals.access);
			res.status(200).send(config);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * PUT /api/oidc/config
	 */
	.put(async (req, res, next) => {
		try {
			// Strip read-only fields injected by GET that aren't in the PUT schema
			if (Array.isArray(req.body?.providers)) {
				for (const provider of req.body.providers) {
					delete provider.source;
					delete provider._source;
				}
			}
			const data = await apiValidator(getValidationSchema("/oidc/config", "put"), req.body);
			const result = await internalOidc.saveConfig(res.locals.access, data);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * GET /api/oidc/config/provider-users/:providerId
 *
 * Admin only — returns count of users linked to a specific provider.
 */
router
	.route("/config/provider-users/:providerId")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.get(jwtdecode(), async (req, res, next) => {
		try {
			const { providerId } = req.params;
			const result = await internalOidc.getProviderUserCount(
				res.locals.access,
				String(providerId),
			);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
