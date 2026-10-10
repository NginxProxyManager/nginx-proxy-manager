import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// env.js reaches the database through the model; the parsing this file covers
// does not, so stub it out rather than standing up a connection.
vi.mock("../models/auth_provider.js", () => ({ default: {} }));
// env.js now reaches provision.js, which imports these; without stubs the real
// modules open a database connection and try to write a JWT key file
vi.mock("../models/auth.js", () => ({ default: {} }));
vi.mock("../models/user.js", () => ({ default: {} }));
vi.mock("../models/user_permission.js", () => ({ default: {} }));
// env.js also reaches local-auth.js, which reads the setting behind AUTH_DISABLE_LOCAL
vi.mock("../models/setting.js", () => ({ default: {} }));

const { getEnvProviders, localAuthDisabledByEnv } = await import("../lib/auth/env.js");

const AUTH_VARS = /^AUTH_/;
let saved;

beforeEach(() => {
	saved = { ...process.env };
	for (const key of Object.keys(process.env)) {
		if (AUTH_VARS.test(key)) {
			delete process.env[key];
		}
	}
});

afterEach(() => {
	process.env = saved;
});

describe("getEnvProviders", () => {
	it("returns nothing when no provider is enabled", () => {
		expect(getEnvProviders()).toEqual([]);
	});

	it("builds an LDAP provider from the environment", () => {
		process.env.AUTH_LDAP_ENABLED = "true";
		process.env.AUTH_LDAP_URL = "ldaps://ldap.example.com:636";
		process.env.AUTH_LDAP_BASE_DN = "dc=example,dc=com";

		const [provider] = getEnvProviders();

		expect(provider.type).toBe("ldap");
		expect(provider.slug).toBe("env-ldap");
		expect(provider.is_env_managed).toBe(true);
		expect(provider.is_enabled).toBe(true);
		expect(provider.meta.url).toBe("ldaps://ldap.example.com:636");
		expect(provider.meta.base_dn).toBe("dc=example,dc=com");
	});

	it("names a provider after its type when no name is given", () => {
		process.env.AUTH_SAML_ENABLED = "1";
		expect(getEnvProviders()[0].name).toBe("SAML");

		process.env.AUTH_SAML_NAME = "Company SSO";
		expect(getEnvProviders()[0].name).toBe("Company SSO");
	});

	it.each(["1", "true", "TRUE", "yes", "on"])("treats %s as enabled", (value) => {
		process.env.AUTH_LDAP_ENABLED = value;
		expect(getEnvProviders()).toHaveLength(1);
	});

	it.each(["0", "false", "no", "off", "", "banana"])("treats %s as not enabled", (value) => {
		process.env.AUTH_LDAP_ENABLED = value;
		expect(getEnvProviders()).toHaveLength(0);
	});

	it("applies boolean defaults, including ones that default to true", () => {
		process.env.AUTH_LDAP_ENABLED = "true";
		expect(getEnvProviders()[0].meta.tls_reject_unauthorized).toBe(true);

		process.env.AUTH_LDAP_TLS_REJECT_UNAUTHORIZED = "false";
		expect(getEnvProviders()[0].meta.tls_reject_unauthorized).toBe(false);
	});

	it("parses integers and falls back when they are nonsense", () => {
		process.env.AUTH_LDAP_ENABLED = "true";
		process.env.AUTH_LDAP_TIMEOUT = "2500";
		expect(getEnvProviders()[0].meta.timeout).toBe(2500);

		process.env.AUTH_LDAP_TIMEOUT = "not-a-number";
		expect(getEnvProviders()[0].meta.timeout).toBe(10000);
	});

	it("splits a comma separated role list", () => {
		process.env.AUTH_LDAP_ENABLED = "true";
		process.env.AUTH_LDAP_DEFAULT_ROLES = "admin, viewer ,, ";
		expect(getEnvProviders()[0].meta.default_roles).toEqual(["admin", "viewer"]);
	});

	it("reads the sync settings", () => {
		process.env.AUTH_LDAP_ENABLED = "true";
		process.env.AUTH_LDAP_SYNC_ENABLED = "true";
		process.env.AUTH_LDAP_SYNC_INTERVAL = "15";
		process.env.AUTH_LDAP_SYNC_DISABLE_MISSING = "yes";

		const { meta } = getEnvProviders()[0];
		expect(meta.sync_enabled).toBe(true);
		expect(meta.sync_interval).toBe(15);
		expect(meta.sync_disable_missing).toBe(true);
	});

	it("can configure all three types at once, each with its own slug", () => {
		process.env.AUTH_LDAP_ENABLED = "true";
		process.env.AUTH_SAML_ENABLED = "true";
		process.env.AUTH_OAUTH_ENABLED = "true";

		const providers = getEnvProviders();
		expect(providers.map((p) => p.slug)).toEqual(["env-ldap", "env-saml", "env-oauth"]);
		expect(new Set(providers.map((p) => p.sort_order)).size).toBe(3);
	});
});

describe("localAuthDisabledByEnv", () => {
	it("returns null when unset, so the stored setting decides", () => {
		delete process.env.AUTH_DISABLE_LOCAL;
		expect(localAuthDisabledByEnv()).toBeNull();

		process.env.AUTH_DISABLE_LOCAL = "";
		expect(localAuthDisabledByEnv()).toBeNull();
	});

	it("overrides in both directions once set", () => {
		process.env.AUTH_DISABLE_LOCAL = "true";
		expect(localAuthDisabledByEnv()).toBe(true);

		process.env.AUTH_DISABLE_LOCAL = "false";
		expect(localAuthDisabledByEnv()).toBe(false);
	});
});
