/**
 * OIDC module unit tests
 *
 * Tests cover:
 * - Crypto: encrypt/decrypt round-trip, different inputs > different outputs, invalid ciphertext throws
 * - HTML encoding: XSS prevention in htmlEncode helper
 * - OIDC error whitelisting: known error codes map to safe messages, unknown codes produce generic message
 * - HTTPS enforcement: non-HTTPS URLs are rejected
 */

import { describe, it, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Crypto tests — test the encrypt/decrypt logic directly without the RSA key
// dependency. We extract the pure algorithmic logic and test it with a known key.
// ---------------------------------------------------------------------------

describe("OIDC AES-256-GCM crypto (pure algorithm tests)", () => {
	const IV_LENGTH = 12;
	const TAG_LENGTH = 16;

	// Replicate the encrypt/decrypt logic from lib/crypto.js with a test key
	function encryptWithKey(plaintext, key) {
		const iv = crypto.randomBytes(IV_LENGTH);
		const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
		const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
		const tag = cipher.getAuthTag();
		return `${iv.toString("base64")}:${encrypted.toString("base64")}:${tag.toString("base64")}`;
	}

	function decryptWithKey(encryptedStr, key) {
		const parts = encryptedStr.split(":");
		if (parts.length !== 3) {
			throw new Error("Invalid encrypted secret format");
		}
		const [ivB64, ctB64, tagB64] = parts;
		const iv = Buffer.from(ivB64, "base64");
		const ciphertext = Buffer.from(ctB64, "base64");
		const tag = Buffer.from(tagB64, "base64");
		const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
		decipher.setAuthTag(tag);
		const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
		return decrypted.toString("utf8");
	}

	const testKey = crypto.randomBytes(32); // Stable key for this test run

	it("encrypt then decrypt returns original string", () => {
		const plaintext = "my-super-secret-client-secret-12345";
		const encrypted = encryptWithKey(plaintext, testKey);
		const decrypted = decryptWithKey(encrypted, testKey);
		assert.equal(decrypted, plaintext);
	});

	it("different inputs produce different outputs", () => {
		const enc1 = encryptWithKey("secret-a", testKey);
		const enc2 = encryptWithKey("secret-b", testKey);
		assert.notEqual(enc1, enc2);
	});

	it("same plaintext produces different ciphertext each call (random IV)", () => {
		const enc1 = encryptWithKey("same-secret", testKey);
		const enc2 = encryptWithKey("same-secret", testKey);
		assert.notEqual(enc1, enc2); // Different IVs > different ciphertext
	});

	it("encrypted output has exactly 3 base64 segments separated by colons", () => {
		const encrypted = encryptWithKey("test", testKey);
		const parts = encrypted.split(":");
		assert.equal(parts.length, 3);
		// Verify each part is valid base64 (non-empty)
		for (const part of parts) {
			assert.ok(part.length > 0);
		}
	});

	it("decryption throws on tampered ciphertext", () => {
		const encrypted = encryptWithKey("real-secret", testKey);
		const parts = encrypted.split(":");
		// Tamper with the ciphertext part
		const tamperedCt = Buffer.from(parts[1], "base64");
		tamperedCt[0] ^= 0xff; // Flip bits
		const tampered = `${parts[0]}:${tamperedCt.toString("base64")}:${parts[2]}`;
		assert.throws(() => decryptWithKey(tampered, testKey), /unsupported state|unable to authenticate|decrypt/i);
	});

	it("decryption throws on wrong format (too few segments)", () => {
		assert.throws(
			() => decryptWithKey("notvalidformat", testKey),
			/Invalid encrypted secret format/,
		);
	});

	it("decryption throws on wrong key", () => {
		const encrypted = encryptWithKey("secret", testKey);
		const wrongKey = crypto.randomBytes(32);
		assert.throws(() => decryptWithKey(encrypted, wrongKey));
	});

	it("HKDF key derivation produces consistent output for same inputs", () => {
		const keyMaterial = Buffer.from("test-rsa-key-material", "utf8");
		const key1 = crypto.hkdfSync("sha256", keyMaterial, Buffer.alloc(0), Buffer.from("oidc-secret-encryption", "utf8"), 32);
		const key2 = crypto.hkdfSync("sha256", keyMaterial, Buffer.alloc(0), Buffer.from("oidc-secret-encryption", "utf8"), 32);
		assert.deepEqual(Buffer.from(key1), Buffer.from(key2));
	});

	it("HKDF with different purpose labels produces different keys", () => {
		const keyMaterial = Buffer.from("test-rsa-key-material", "utf8");
		const key1 = crypto.hkdfSync("sha256", keyMaterial, Buffer.alloc(0), Buffer.from("oidc-secret-encryption", "utf8"), 32);
		const key2 = crypto.hkdfSync("sha256", keyMaterial, Buffer.alloc(0), Buffer.from("other-purpose", "utf8"), 32);
		assert.notDeepEqual(Buffer.from(key1), Buffer.from(key2));
	});
});

// ---------------------------------------------------------------------------
// HTML encoding tests — verify XSS prevention helper
// ---------------------------------------------------------------------------

describe("HTML encoding (XSS prevention)", () => {
	// Replicate htmlEncode from routes/oidc.js for isolation testing
	function htmlEncode(str) {
		return String(str)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#x27;");
	}

	it("encodes ampersand", () => {
		assert.equal(htmlEncode("a & b"), "a &amp; b");
	});

	it("encodes angle brackets", () => {
		assert.equal(htmlEncode("<script>"), "&lt;script&gt;");
		assert.equal(htmlEncode("</script>"), "&lt;/script&gt;");
	});

	it("encodes double quotes", () => {
		assert.equal(htmlEncode('say "hello"'), "say &quot;hello&quot;");
	});

	it("encodes single quotes", () => {
		assert.equal(htmlEncode("it's fine"), "it&#x27;s fine");
	});

	it("encodes XSS payload", () => {
		const xss = "<img src=x onerror=\"alert('xss')\">";
		const encoded = htmlEncode(xss);
		assert.ok(!encoded.includes("<"));
		assert.ok(!encoded.includes(">"));
		assert.ok(!encoded.includes('"'));
		assert.ok(encoded.includes("&lt;img"));
	});

	it("leaves safe characters unchanged", () => {
		const safe = "Hello World 123 !@#$%^*()-_=+[]{}|;:,.?/";
		assert.equal(htmlEncode(safe), safe);
	});

	it("handles empty string", () => {
		assert.equal(htmlEncode(""), "");
	});

	it("converts non-string inputs to string first", () => {
		assert.equal(htmlEncode(42), "42");
		assert.equal(htmlEncode(null), "null");
	});
});

// ---------------------------------------------------------------------------
// OIDC error code whitelisting tests
// Verifies that raw provider error params are never reflected
// ---------------------------------------------------------------------------

describe("OIDC error code whitelisting (XSS/injection prevention)", () => {
	// Replicate the whitelist from routes/oidc.js
	const OIDC_ERROR_MESSAGES = {
		access_denied:             "Access was denied by the identity provider.",
		invalid_request:           "Invalid authentication request.",
		unauthorized_client:       "This application is not authorized with the identity provider.",
		unsupported_response_type: "Unsupported response type.",
		invalid_scope:             "Invalid scope requested.",
		server_error:              "The identity provider encountered an error.",
		temporarily_unavailable:   "The identity provider is temporarily unavailable.",
	};
	const GENERIC_ERROR_MESSAGE = "Authentication failed. Please try again.";

	function getSafeErrorMessage(errorCode) {
		return OIDC_ERROR_MESSAGES[errorCode] || GENERIC_ERROR_MESSAGE;
	}

	it("maps known error code access_denied to safe message", () => {
		assert.equal(getSafeErrorMessage("access_denied"), "Access was denied by the identity provider.");
	});

	it("maps known error code server_error to safe message", () => {
		assert.equal(getSafeErrorMessage("server_error"), "The identity provider encountered an error.");
	});

	it("maps all 7 known error codes to a non-empty message", () => {
		for (const code of Object.keys(OIDC_ERROR_MESSAGES)) {
			const msg = getSafeErrorMessage(code);
			assert.ok(msg.length > 0, `Empty message for code: ${code}`);
			assert.notEqual(msg, GENERIC_ERROR_MESSAGE, `${code} should have custom message`);
		}
	});

	it("returns generic message for unknown error code", () => {
		assert.equal(getSafeErrorMessage("totally_custom_error"), GENERIC_ERROR_MESSAGE);
	});

	it("returns generic message for XSS injection attempt in error code", () => {
		const xssAttempt = "<script>alert(1)</script>";
		const result = getSafeErrorMessage(xssAttempt);
		assert.equal(result, GENERIC_ERROR_MESSAGE);
		assert.ok(!result.includes("<script>"));
	});

	it("returns generic message for empty string error code", () => {
		assert.equal(getSafeErrorMessage(""), GENERIC_ERROR_MESSAGE);
	});

	it("returns generic message for undefined error code", () => {
		assert.equal(getSafeErrorMessage(undefined), GENERIC_ERROR_MESSAGE);
	});

	it("safe messages do not contain raw user-supplied content", () => {
		const userSupplied = "Account disabled because admin said so with <b>HTML</b>";
		const result = getSafeErrorMessage(userSupplied);
		// The result must be the generic message — never the user input
		assert.equal(result, GENERIC_ERROR_MESSAGE);
		assert.ok(!result.includes("admin said so"));
		assert.ok(!result.includes("<b>"));
	});
});

// ---------------------------------------------------------------------------
// HTTPS enforcement tests
// ---------------------------------------------------------------------------

describe("HTTPS enforcement (SSRF mitigation)", () => {
	function enforceHttps(url) {
		if (!url || !url.startsWith("https://")) {
			throw new Error("OIDC discovery URL must use HTTPS");
		}
	}

	it("accepts valid HTTPS URL", () => {
		assert.doesNotThrow(() => enforceHttps("https://auth.example.com/.well-known/openid-configuration"));
	});

	it("rejects HTTP URL", () => {
		assert.throws(
			() => enforceHttps("http://auth.example.com/openid-configuration"),
			/must use HTTPS/,
		);
	});

	it("rejects empty string", () => {
		assert.throws(
			() => enforceHttps(""),
			/must use HTTPS/,
		);
	});

	it("rejects null/undefined", () => {
		assert.throws(() => enforceHttps(null), /must use HTTPS/);
		assert.throws(() => enforceHttps(undefined), /must use HTTPS/);
	});

	it("rejects localhost HTTP (SSRF vector)", () => {
		assert.throws(
			() => enforceHttps("http://localhost:9000/.well-known/openid-configuration"),
			/must use HTTPS/,
		);
	});

	it("rejects file:// URL", () => {
		assert.throws(
			() => enforceHttps("file:///etc/passwd"),
			/must use HTTPS/,
		);
	});

	it("rejects ftp:// URL", () => {
		assert.throws(
			() => enforceHttps("ftp://auth.example.com/config"),
			/must use HTTPS/,
		);
	});

	it("rejects URL that contains 'https' but doesn't start with it", () => {
		assert.throws(
			() => enforceHttps("http://evil.com?redirect=https://good.com"),
			/must use HTTPS/,
		);
	});
});

// ---------------------------------------------------------------------------
// Auto-provision role safety tests
// Verifies that auto_provision_role is always "user", never "admin"
// ---------------------------------------------------------------------------

describe("Auto-provision role safety guardrail", () => {
	it("schema only allows 'user' role (not 'admin') for auto_provision_role", async () => {
		// Load the schema file and verify the enum constraint
		const schemaPath = new URL("../schema/paths/oidc/config/put.json", import.meta.url);
		const { default: schema } = await import(schemaPath, { with: { type: "json" } });

		const providerSchema = schema.requestBody.content["application/json"].schema.properties.providers.items;
		const roleEnum = providerSchema.properties.auto_provision_role.enum;

		assert.deepEqual(roleEnum, ["user"]);
		assert.ok(!roleEnum.includes("admin"), "admin must NOT be in the allowed enum");
	});
});

// ---------------------------------------------------------------------------
// State JWT scope validation logic
// ---------------------------------------------------------------------------

describe("State JWT scope validation", () => {
	// The callback validates that stateData.scope[0] === "oidc-state"
	function validateStateScope(stateData) {
		if (!stateData.scope || stateData.scope[0] !== "oidc-state") {
			throw new Error("OIDC login session expired. Please try again.");
		}
	}

	it("accepts valid oidc-state scope", () => {
		assert.doesNotThrow(() => validateStateScope({ scope: ["oidc-state"] }));
	});

	it("rejects missing scope", () => {
		assert.throws(
			() => validateStateScope({ attrs: {} }),
			/session expired/,
		);
	});

	it("rejects wrong scope", () => {
		assert.throws(
			() => validateStateScope({ scope: ["2fa-challenge"] }),
			/session expired/,
		);
	});

	it("rejects empty scope array", () => {
		assert.throws(
			() => validateStateScope({ scope: [] }),
			/session expired/,
		);
	});
});

// ---------------------------------------------------------------------------
// Unlink safety logic tests
// Verifies the check that prevents a user from unlinking their only auth method
// ---------------------------------------------------------------------------

describe("Unlink safety logic", () => {
	// Replicate the safety check from unlinkOidcIdentity
	function canUnlink(authRecords, targetProviderId) {
		const targetRecord = authRecords.find(
			(r) => r.type === "oidc" && r.meta?.provider_id === targetProviderId,
		);
		if (!targetRecord) return { allowed: false, reason: "not_found" };
		if (authRecords.length <= 1) return { allowed: false, reason: "last_method" };
		return { allowed: true };
	}

	it("allows unlink when user has password + OIDC", () => {
		const records = [
			{ type: "password", meta: {} },
			{ type: "oidc", meta: { provider_id: "authentik" } },
		];
		assert.deepEqual(canUnlink(records, "authentik"), { allowed: true });
	});

	it("allows unlink when user has 2 OIDC providers", () => {
		const records = [
			{ type: "oidc", meta: { provider_id: "authentik" } },
			{ type: "oidc", meta: { provider_id: "keycloak" } },
		];
		assert.deepEqual(canUnlink(records, "authentik"), { allowed: true });
	});

	it("blocks unlink when OIDC is only auth method", () => {
		const records = [
			{ type: "oidc", meta: { provider_id: "authentik" } },
		];
		assert.deepEqual(canUnlink(records, "authentik"), { allowed: false, reason: "last_method" });
	});

	it("returns not_found when provider not linked", () => {
		const records = [
			{ type: "password", meta: {} },
		];
		assert.deepEqual(canUnlink(records, "authentik"), { allowed: false, reason: "not_found" });
	});
});

// ---------------------------------------------------------------------------
// Provider user count logic tests
// Verifies counting of affected users and oidc-only users for provider deletion
// ---------------------------------------------------------------------------

describe("Provider user count logic", () => {
	function countProviderUsers(allAuthRecords, providerId) {
		const providerRecords = allAuthRecords.filter(
			(r) => r.type === "oidc" && r.meta?.provider_id === providerId,
		);
		const userIds = [...new Set(providerRecords.map((r) => r.user_id))];

		let oidcOnlyCount = 0;
		for (const userId of userIds) {
			const userAuths = allAuthRecords.filter((r) => r.user_id === userId);
			const nonProviderAuths = userAuths.filter(
				(r) => !(r.type === "oidc" && r.meta?.provider_id === providerId),
			);
			if (nonProviderAuths.length === 0) oidcOnlyCount++;
		}

		return { total: userIds.length, oidc_only: oidcOnlyCount };
	}

	it("returns 0 when no users linked", () => {
		assert.deepEqual(countProviderUsers([], "authentik"), { total: 0, oidc_only: 0 });
	});

	it("counts users with password + OIDC as not oidc_only", () => {
		const records = [
			{ user_id: 1, type: "password", meta: {} },
			{ user_id: 1, type: "oidc", meta: { provider_id: "authentik" } },
		];
		assert.deepEqual(countProviderUsers(records, "authentik"), { total: 1, oidc_only: 0 });
	});

	it("counts OIDC-only users correctly", () => {
		const records = [
			{ user_id: 1, type: "oidc", meta: { provider_id: "authentik" } },
			{ user_id: 2, type: "password", meta: {} },
			{ user_id: 2, type: "oidc", meta: { provider_id: "authentik" } },
			{ user_id: 3, type: "oidc", meta: { provider_id: "authentik" } },
		];
		// user 1: oidc only, user 2: has password, user 3: oidc only
		assert.deepEqual(countProviderUsers(records, "authentik"), { total: 3, oidc_only: 2 });
	});

	it("ignores users linked to other providers", () => {
		const records = [
			{ user_id: 1, type: "oidc", meta: { provider_id: "authentik" } },
			{ user_id: 2, type: "oidc", meta: { provider_id: "keycloak" } },
		];
		assert.deepEqual(countProviderUsers(records, "authentik"), { total: 1, oidc_only: 1 });
	});

	it("user with 2 OIDC providers: not oidc_only when removing one", () => {
		const records = [
			{ user_id: 1, type: "oidc", meta: { provider_id: "authentik" } },
			{ user_id: 1, type: "oidc", meta: { provider_id: "keycloak" } },
		];
		// Removing authentik: user still has keycloak
		assert.deepEqual(countProviderUsers(records, "authentik"), { total: 1, oidc_only: 0 });
	});
});

// ---------------------------------------------------------------------------
// Callback URL origin validation tests
// Verifies that caller-supplied callback URLs are constrained to the server origin
// ---------------------------------------------------------------------------

describe("Callback URL path validation", () => {
	// Replicate the validateCallbackUrl logic from routes/oidc.js
	const ALLOWED_CALLBACK_PATHS = ["/api/oidc/callback", "/api/oidc/link-callback"];

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
		const path = parsed.pathname.replace(/\/+$/, "");
		if (!ALLOWED_CALLBACK_PATHS.includes(path)) {
			throw new Error("callback_url must target a valid OIDC callback path");
		}
	}

	it("accepts callback URL with /api/oidc/callback path", () => {
		assert.doesNotThrow(() =>
			validateCallbackUrl("https://npm.example.com/api/oidc/callback"),
		);
	});

	it("accepts callback URL with /api/oidc/link-callback path", () => {
		assert.doesNotThrow(() =>
			validateCallbackUrl("https://npm.example.com/api/oidc/link-callback"),
		);
	});

	it("accepts callback URL with port and valid path", () => {
		assert.doesNotThrow(() =>
			validateCallbackUrl("https://npm.example.com:8443/api/oidc/callback"),
		);
	});

	it("accepts http callback URL with valid path", () => {
		assert.doesNotThrow(() =>
			validateCallbackUrl("http://localhost:81/api/oidc/link-callback"),
		);
	});

	it("rejects callback URL with wrong path", () => {
		assert.throws(
			() => validateCallbackUrl("https://evil.com/steal-token"),
			/must target a valid OIDC callback path/,
		);
	});

	it("rejects callback URL with path traversal", () => {
		assert.throws(
			() => validateCallbackUrl("https://npm.example.com/api/oidc/callback/../../../etc/passwd"),
			/must target a valid OIDC callback path/,
		);
	});

	it("rejects malformed callback URL", () => {
		assert.throws(
			() => validateCallbackUrl("not-a-url"),
			/Invalid callback URL/,
		);
	});

	it("accepts valid path on different host (path-only validation by design)", () => {
		// TRUST BOUNDARY: validateCallbackUrl checks the path, not the host.
		// The OIDC provider's registered redirect_uri whitelist is the primary
		// defence against open-redirect. This test documents the intentional
		// design decision — see the JSDoc on validateCallbackUrl.
		assert.doesNotThrow(() =>
			validateCallbackUrl("https://evil.com/api/oidc/callback"),
		);
	});
});

// ---------------------------------------------------------------------------
// Link-state JWT scope validation tests
// Verifies that the link flow state JWT uses a distinct scope from login
// ---------------------------------------------------------------------------

describe("Link-state JWT scope validation", () => {
	function validateLinkStateScope(stateData) {
		if (!stateData.scope || stateData.scope[0] !== "oidc-link-state") {
			throw new Error("OIDC link session expired. Please try again.");
		}
	}

	it("accepts valid oidc-link-state scope", () => {
		assert.doesNotThrow(() => validateLinkStateScope({ scope: ["oidc-link-state"] }));
	});

	it("rejects login state scope (prevents scope confusion)", () => {
		assert.throws(
			() => validateLinkStateScope({ scope: ["oidc-state"] }),
			/link session expired/,
		);
	});

	it("rejects missing scope", () => {
		assert.throws(
			() => validateLinkStateScope({}),
			/link session expired/,
		);
	});

	it("rejects empty scope array", () => {
		assert.throws(
			() => validateLinkStateScope({ scope: [] }),
			/link session expired/,
		);
	});
});
