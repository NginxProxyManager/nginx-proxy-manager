/**
 * Tests for backend/lib/oidc-file-config.js
 *
 * Covers:
 * - File loading: valid JSON, invalid JSON, missing file
 * - Required field validation: missing id, name, discovery_url, client_id
 * - HTTPS enforcement on discovery_url
 * - ${OIDC_*} env var expansion (allowed) and non-OIDC_ prefix (blocked)
 * - Undefined env var → empty string + warning
 * - Single-provider OIDC_PROVIDER_* env vars
 * - _source: "file" on all loaded providers
 * - auto_provision_role forced to "user"
 * - Cache reset between tests
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempFile(content) {
	const dir = os.tmpdir();
	const file = path.join(dir, `oidc-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
	fs.writeFileSync(file, content, "utf8");
	return file;
}

function makeValidProvider(overrides = {}) {
	return {
		id: "test-provider",
		name: "Test Provider",
		discovery_url: "https://auth.example.com/.well-known/openid-configuration",
		client_id: "test-client",
		client_secret: "test-secret",
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Reset module cache between tests so env var / file changes take effect.
// node:test doesn't reload modules between tests, so we use _resetCache().
// ---------------------------------------------------------------------------

let resetCache;
let getFileProviders;
let loadFileConfig;

before(async () => {
	({ _resetCache: resetCache, getFileProviders, loadFileConfig } = await import("../lib/oidc-file-config.js"));
});

beforeEach(() => {
	// Reset the singleton so each test starts fresh
	resetCache();

	// Clean up env vars set by previous tests
	delete process.env.OIDC_CONFIG_FILE;
	delete process.env.OIDC_PROVIDER_ID;
	delete process.env.OIDC_PROVIDER_NAME;
	delete process.env.OIDC_PROVIDER_DISCOVERY_URL;
	delete process.env.OIDC_PROVIDER_CLIENT_ID;
	delete process.env.OIDC_PROVIDER_CLIENT_SECRET;
	delete process.env.OIDC_PROVIDER_SCOPES;
	delete process.env.OIDC_PROVIDER_ENABLED;
	delete process.env.OIDC_PROVIDER_AUTO_PROVISION;
	delete process.env.OIDC_PROVIDER_USE_PAR;
	delete process.env.OIDC_TEST_SECRET;
	delete process.env.OIDC_PROVIDER_CLAIM_EMAIL;
	delete process.env.OIDC_PROVIDER_CLAIM_NAME;
	delete process.env.OIDC_PROVIDER_CLAIM_NICKNAME;
	delete process.env.OIDC_PROVIDER_CLAIM_AVATAR;
});

// ---------------------------------------------------------------------------
// File loading tests
// ---------------------------------------------------------------------------

describe("File loading", () => {
	it("returns empty array when OIDC_CONFIG_FILE is not set", () => {
		const providers = getFileProviders();
		assert.deepStrictEqual(providers, []);
	});

	it("returns empty array when config file does not exist", () => {
		process.env.OIDC_CONFIG_FILE = "/tmp/nonexistent-oidc-config-xyz.json";
		const providers = getFileProviders();
		assert.deepStrictEqual(providers, []);
	});

	it("returns empty array for invalid JSON", () => {
		const file = makeTempFile("{ this is not json }");
		process.env.OIDC_CONFIG_FILE = file;
		const providers = getFileProviders();
		assert.deepStrictEqual(providers, []);
		fs.unlinkSync(file);
	});

	it("returns empty array when file has no providers array", () => {
		const file = makeTempFile(JSON.stringify({ something_else: true }));
		process.env.OIDC_CONFIG_FILE = file;
		const providers = getFileProviders();
		assert.deepStrictEqual(providers, []);
		fs.unlinkSync(file);
	});

	it("loads valid providers from file", () => {
		const file = makeTempFile(JSON.stringify({
			providers: [makeValidProvider()],
		}));
		process.env.OIDC_CONFIG_FILE = file;
		const providers = getFileProviders();
		assert.strictEqual(providers.length, 1);
		assert.strictEqual(providers[0].id, "test-provider");
		fs.unlinkSync(file);
	});

	it("loads multiple providers from file", () => {
		const file = makeTempFile(JSON.stringify({
			providers: [
				makeValidProvider({ id: "provider-a", name: "Provider A" }),
				makeValidProvider({ id: "provider-b", name: "Provider B" }),
			],
		}));
		process.env.OIDC_CONFIG_FILE = file;
		const providers = getFileProviders();
		assert.strictEqual(providers.length, 2);
		fs.unlinkSync(file);
	});
});

// ---------------------------------------------------------------------------
// _source field
// ---------------------------------------------------------------------------

describe("_source field", () => {
	it("file providers have _source: 'file'", () => {
		const file = makeTempFile(JSON.stringify({ providers: [makeValidProvider()] }));
		process.env.OIDC_CONFIG_FILE = file;
		const providers = getFileProviders();
		assert.strictEqual(providers[0]._source, "file");
		fs.unlinkSync(file);
	});

	it("env var providers have _source: 'file'", () => {
		process.env.OIDC_PROVIDER_ID = "env-provider";
		process.env.OIDC_PROVIDER_NAME = "Env Provider";
		process.env.OIDC_PROVIDER_DISCOVERY_URL = "https://auth.example.com/.well-known/openid-configuration";
		process.env.OIDC_PROVIDER_CLIENT_ID = "env-client";
		process.env.OIDC_PROVIDER_CLIENT_SECRET = "env-secret";
		const providers = getFileProviders();
		assert.strictEqual(providers[0]._source, "file");
	});
});

// ---------------------------------------------------------------------------
// Required field validation
// ---------------------------------------------------------------------------

describe("Required field validation", () => {
	it("skips provider missing id", () => {
		const file = makeTempFile(JSON.stringify({
			providers: [makeValidProvider({ id: undefined })],
		}));
		process.env.OIDC_CONFIG_FILE = file;
		const providers = getFileProviders();
		assert.strictEqual(providers.length, 0);
		fs.unlinkSync(file);
	});

	it("skips provider missing name", () => {
		const file = makeTempFile(JSON.stringify({
			providers: [makeValidProvider({ name: undefined })],
		}));
		process.env.OIDC_CONFIG_FILE = file;
		const providers = getFileProviders();
		assert.strictEqual(providers.length, 0);
		fs.unlinkSync(file);
	});

	it("skips provider missing discovery_url", () => {
		const file = makeTempFile(JSON.stringify({
			providers: [makeValidProvider({ discovery_url: undefined })],
		}));
		process.env.OIDC_CONFIG_FILE = file;
		const providers = getFileProviders();
		assert.strictEqual(providers.length, 0);
		fs.unlinkSync(file);
	});

	it("skips provider missing client_id", () => {
		const file = makeTempFile(JSON.stringify({
			providers: [makeValidProvider({ client_id: undefined })],
		}));
		process.env.OIDC_CONFIG_FILE = file;
		const providers = getFileProviders();
		assert.strictEqual(providers.length, 0);
		fs.unlinkSync(file);
	});

	it("loads valid provider alongside invalid one", () => {
		const file = makeTempFile(JSON.stringify({
			providers: [
				makeValidProvider({ id: undefined }), // invalid
				makeValidProvider({ id: "valid-one", name: "Valid" }), // valid
			],
		}));
		process.env.OIDC_CONFIG_FILE = file;
		const providers = getFileProviders();
		assert.strictEqual(providers.length, 1);
		assert.strictEqual(providers[0].id, "valid-one");
		fs.unlinkSync(file);
	});
});

// ---------------------------------------------------------------------------
// HTTPS enforcement
// ---------------------------------------------------------------------------

describe("HTTPS enforcement", () => {
	it("skips provider with http:// discovery_url", () => {
		const file = makeTempFile(JSON.stringify({
			providers: [makeValidProvider({ discovery_url: "http://auth.example.com/.well-known/openid-configuration" })],
		}));
		process.env.OIDC_CONFIG_FILE = file;
		const providers = getFileProviders();
		assert.strictEqual(providers.length, 0);
		fs.unlinkSync(file);
	});

	it("skips provider with ftp:// discovery_url", () => {
		const file = makeTempFile(JSON.stringify({
			providers: [makeValidProvider({ discovery_url: "ftp://auth.example.com/openid-config" })],
		}));
		process.env.OIDC_CONFIG_FILE = file;
		const providers = getFileProviders();
		assert.strictEqual(providers.length, 0);
		fs.unlinkSync(file);
	});

	it("accepts provider with https:// discovery_url", () => {
		const file = makeTempFile(JSON.stringify({
			providers: [makeValidProvider()],
		}));
		process.env.OIDC_CONFIG_FILE = file;
		const providers = getFileProviders();
		assert.strictEqual(providers.length, 1);
		fs.unlinkSync(file);
	});
});

// ---------------------------------------------------------------------------
// Env var expansion in client_secret
// ---------------------------------------------------------------------------

describe("Env var expansion (${OIDC_*})", () => {
	it("expands ${OIDC_*} references in client_secret", () => {
		process.env.OIDC_TEST_SECRET = "resolved-secret-value";
		const file = makeTempFile(JSON.stringify({
			providers: [makeValidProvider({ client_secret: "${OIDC_TEST_SECRET}" })],
		}));
		process.env.OIDC_CONFIG_FILE = file;
		const providers = getFileProviders();
		assert.strictEqual(providers[0].client_secret, "resolved-secret-value");
		fs.unlinkSync(file);
		delete process.env.OIDC_TEST_SECRET;
	});

	it("does NOT expand non-OIDC_ prefixed env vars (security)", () => {
		// Set a "dangerous" env var that should not be expanded
		process.env.DB_MYSQL_PASSWORD = "do-not-leak-this";
		const file = makeTempFile(JSON.stringify({
			providers: [makeValidProvider({ client_secret: "${DB_MYSQL_PASSWORD}" })],
		}));
		process.env.OIDC_CONFIG_FILE = file;
		const providers = getFileProviders();
		// The literal string should remain unexpanded (regex only matches OIDC_*)
		assert.strictEqual(providers[0].client_secret, "${DB_MYSQL_PASSWORD}");
		fs.unlinkSync(file);
		delete process.env.DB_MYSQL_PASSWORD;
	});

	it("resolves undefined OIDC_ var to empty string", () => {
		delete process.env.OIDC_UNDEFINED_VAR;
		const file = makeTempFile(JSON.stringify({
			providers: [makeValidProvider({ client_secret: "${OIDC_UNDEFINED_VAR}" })],
		}));
		process.env.OIDC_CONFIG_FILE = file;
		const providers = getFileProviders();
		assert.strictEqual(providers[0].client_secret, "");
		fs.unlinkSync(file);
	});
});

// ---------------------------------------------------------------------------
// Single-provider OIDC_PROVIDER_* env vars
// ---------------------------------------------------------------------------

describe("Single-provider env vars (OIDC_PROVIDER_*)", () => {
	it("returns empty array when OIDC_PROVIDER_ID is not set", () => {
		const providers = getFileProviders();
		assert.deepStrictEqual(providers, []);
	});

	it("loads provider from OIDC_PROVIDER_* env vars", () => {
		process.env.OIDC_PROVIDER_ID = "authentik";
		process.env.OIDC_PROVIDER_NAME = "Authentik";
		process.env.OIDC_PROVIDER_DISCOVERY_URL = "https://auth.example.com/.well-known/openid-configuration";
		process.env.OIDC_PROVIDER_CLIENT_ID = "npm-client";
		process.env.OIDC_PROVIDER_CLIENT_SECRET = "super-secret";
		const providers = getFileProviders();
		assert.strictEqual(providers.length, 1);
		assert.strictEqual(providers[0].id, "authentik");
		assert.strictEqual(providers[0].name, "Authentik");
		assert.strictEqual(providers[0].client_id, "npm-client");
		assert.strictEqual(providers[0].client_secret, "super-secret");
	});

	it("uses default scopes when OIDC_PROVIDER_SCOPES is not set", () => {
		process.env.OIDC_PROVIDER_ID = "test";
		process.env.OIDC_PROVIDER_DISCOVERY_URL = "https://auth.example.com/.well-known/openid-configuration";
		process.env.OIDC_PROVIDER_CLIENT_ID = "client";
		const providers = getFileProviders();
		assert.strictEqual(providers[0].scopes, "openid email profile");
	});

	it("skips env var provider when OIDC_PROVIDER_DISCOVERY_URL is missing", () => {
		process.env.OIDC_PROVIDER_ID = "broken";
		process.env.OIDC_PROVIDER_CLIENT_ID = "client";
		// No OIDC_PROVIDER_DISCOVERY_URL
		const providers = getFileProviders();
		assert.strictEqual(providers.length, 0);
	});

	it("skips env var provider when OIDC_PROVIDER_DISCOVERY_URL uses http://", () => {
		process.env.OIDC_PROVIDER_ID = "broken";
		process.env.OIDC_PROVIDER_DISCOVERY_URL = "http://auth.example.com/openid-config";
		process.env.OIDC_PROVIDER_CLIENT_ID = "client";
		const providers = getFileProviders();
		assert.strictEqual(providers.length, 0);
	});

	it("file config wins when env var provider has same ID as file provider", () => {
		const file = makeTempFile(JSON.stringify({
			providers: [makeValidProvider({ id: "same-id", name: "From File" })],
		}));
		process.env.OIDC_CONFIG_FILE = file;
		process.env.OIDC_PROVIDER_ID = "same-id";
		process.env.OIDC_PROVIDER_NAME = "From Env";
		process.env.OIDC_PROVIDER_DISCOVERY_URL = "https://auth.example.com/.well-known/openid-configuration";
		process.env.OIDC_PROVIDER_CLIENT_ID = "env-client";
		const providers = getFileProviders();
		// Only 1 provider (file wins), and it should be the file version
		assert.strictEqual(providers.length, 1);
		assert.strictEqual(providers[0].name, "From File");
		fs.unlinkSync(file);
	});
});

// ---------------------------------------------------------------------------
// auto_provision_role enforcement
// ---------------------------------------------------------------------------

describe("auto_provision_role enforcement", () => {
	it("forces auto_provision_role to 'user' even when file specifies 'admin'", () => {
		const file = makeTempFile(JSON.stringify({
			providers: [makeValidProvider({ auto_provision_role: "admin" })],
		}));
		process.env.OIDC_CONFIG_FILE = file;
		const providers = getFileProviders();
		assert.strictEqual(providers[0].auto_provision_role, "user");
		fs.unlinkSync(file);
	});

	it("sets auto_provision_role to 'user' by default", () => {
		const file = makeTempFile(JSON.stringify({ providers: [makeValidProvider()] }));
		process.env.OIDC_CONFIG_FILE = file;
		const providers = getFileProviders();
		assert.strictEqual(providers[0].auto_provision_role, "user");
		fs.unlinkSync(file);
	});
});

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

describe("Provider defaults", () => {
	it("enabled defaults to true when not specified", () => {
		const file = makeTempFile(JSON.stringify({ providers: [makeValidProvider()] }));
		process.env.OIDC_CONFIG_FILE = file;
		const providers = getFileProviders();
		assert.strictEqual(providers[0].enabled, true);
		fs.unlinkSync(file);
	});

	it("enabled is false when explicitly set to false", () => {
		const file = makeTempFile(JSON.stringify({ providers: [makeValidProvider({ enabled: false })] }));
		process.env.OIDC_CONFIG_FILE = file;
		const providers = getFileProviders();
		assert.strictEqual(providers[0].enabled, false);
		fs.unlinkSync(file);
	});

	it("use_par defaults to false", () => {
		const file = makeTempFile(JSON.stringify({ providers: [makeValidProvider()] }));
		process.env.OIDC_CONFIG_FILE = file;
		const providers = getFileProviders();
		assert.strictEqual(providers[0].use_par, false);
		fs.unlinkSync(file);
	});

	it("auto_provision defaults to false", () => {
		const file = makeTempFile(JSON.stringify({ providers: [makeValidProvider()] }));
		process.env.OIDC_CONFIG_FILE = file;
		const providers = getFileProviders();
		assert.strictEqual(providers[0].auto_provision, false);
		fs.unlinkSync(file);
	});

	it("scopes default to 'openid email profile'", () => {
		const file = makeTempFile(JSON.stringify({ providers: [makeValidProvider()] }));
		process.env.OIDC_CONFIG_FILE = file;
		const providers = getFileProviders();
		assert.strictEqual(providers[0].scopes, "openid email profile");
		fs.unlinkSync(file);
	});

	it("claim_mapping defaults are applied when not provided", () => {
		const file = makeTempFile(JSON.stringify({ providers: [makeValidProvider()] }));
		process.env.OIDC_CONFIG_FILE = file;
		const providers = getFileProviders();
		assert.deepStrictEqual(providers[0].claim_mapping, {
			email: "email",
			name: "name",
			nickname: "preferred_username",
			avatar: "picture",
		});
		fs.unlinkSync(file);
	});
});

// ---------------------------------------------------------------------------
// Caching
// ---------------------------------------------------------------------------

describe("Caching", () => {
	it("returns the same array reference on repeated calls (singleton)", () => {
		const file = makeTempFile(JSON.stringify({ providers: [makeValidProvider()] }));
		process.env.OIDC_CONFIG_FILE = file;
		const first = getFileProviders();
		const second = getFileProviders();
		assert.strictEqual(first, second);
		fs.unlinkSync(file);
	});

	it("_resetCache allows reloading", () => {
		const file = makeTempFile(JSON.stringify({ providers: [makeValidProvider()] }));
		process.env.OIDC_CONFIG_FILE = file;
		const first = getFileProviders();
		assert.strictEqual(first.length, 1);

		// Reset and change env var
		resetCache();
		delete process.env.OIDC_CONFIG_FILE;
		const second = getFileProviders();
		assert.deepStrictEqual(second, []);
		fs.unlinkSync(file);
	});
});
