/** Unit tests for backend/lib/ldap-env.js */

import { applyEnvOverrides, rowToLdapClientConfig } from "../../lib/ldap-env.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Temporarily set env vars for a single test and restore afterwards. */
const withEnv = (vars, fn) => {
	const saved = {};
	for (const [key, val] of Object.entries(vars)) {
		saved[key] = process.env[key];
		if (val === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = val;
		}
	}
	try {
		return fn();
	} finally {
		for (const [key, val] of Object.entries(saved)) {
			if (val === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = val;
			}
		}
	}
};

/** Ensure env vars are cleaned up before each test. */
const LDAP_ENV_KEYS = [
	"LDAP_ENABLED",
	"LDAP_SERVER_URL",
	"LDAP_BIND_DN",
	"LDAP_BIND_PASSWORD",
	"LDAP_SEARCH_BASE",
	"LDAP_GROUP_DN",
	"LDAP_USER_ATTR",
	"LDAP_ADMIN_GROUP",
	"LDAP_USER_GROUP",
	"LDAP_TLS_VERIFY",
	"LDAP_STARTTLS",
	"LDAP_SYNC_FILTER",
	"LDAP_SYNC_GROUP",
];

beforeEach(() => {
	for (const key of LDAP_ENV_KEYS) {
		delete process.env[key];
	}
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DB_ROW = {
	enabled:        true,
	server_url:     "ldap://db.example.com",
	bind_dn:        "cn=svc,dc=db,dc=example,dc=com",
	bind_password:  "db-password",
	search_base:    "dc=db,dc=example,dc=com",
	group_dn:       "ou=Groups,dc=db,dc=example,dc=com",
	user_attribute: "uid",
	admin_group:    "cn=admins,ou=Groups,dc=db,dc=example,dc=com",
	user_group:     "cn=users,ou=Groups,dc=db,dc=example,dc=com",
	tls_verify:     true,
	starttls:       false,
};

// ---------------------------------------------------------------------------
// Tests — applyEnvOverrides
// ---------------------------------------------------------------------------

describe("applyEnvOverrides — string overrides", () => {
	it("overrides server_url when LDAP_SERVER_URL is set", () => {
		withEnv({ LDAP_SERVER_URL: "ldaps://env.example.com" }, () => {
			const result = applyEnvOverrides({ ...DB_ROW });
			expect(result.server_url).toBe("ldaps://env.example.com");
		});
	});

	it("overrides bind_dn when LDAP_BIND_DN is set", () => {
		withEnv({ LDAP_BIND_DN: "cn=env-svc,dc=example,dc=com" }, () => {
			const result = applyEnvOverrides({ ...DB_ROW });
			expect(result.bind_dn).toBe("cn=env-svc,dc=example,dc=com");
		});
	});

	it("overrides bind_password when LDAP_BIND_PASSWORD is set", () => {
		withEnv({ LDAP_BIND_PASSWORD: "env-secret" }, () => {
			const result = applyEnvOverrides({ ...DB_ROW });
			expect(result.bind_password).toBe("env-secret");
		});
	});

	it("overrides search_base when LDAP_SEARCH_BASE is set", () => {
		withEnv({ LDAP_SEARCH_BASE: "dc=env,dc=example,dc=com" }, () => {
			const result = applyEnvOverrides({ ...DB_ROW });
			expect(result.search_base).toBe("dc=env,dc=example,dc=com");
		});
	});

	it("overrides group_dn when LDAP_GROUP_DN is set", () => {
		withEnv({ LDAP_GROUP_DN: "ou=EnvGroups,dc=example,dc=com" }, () => {
			const result = applyEnvOverrides({ ...DB_ROW });
			expect(result.group_dn).toBe("ou=EnvGroups,dc=example,dc=com");
		});
	});

	it("overrides user_attribute when LDAP_USER_ATTR is set", () => {
		withEnv({ LDAP_USER_ATTR: "sAMAccountName" }, () => {
			const result = applyEnvOverrides({ ...DB_ROW });
			expect(result.user_attribute).toBe("sAMAccountName");
		});
	});

	it("overrides admin_group when LDAP_ADMIN_GROUP is set", () => {
		withEnv({ LDAP_ADMIN_GROUP: "cn=env-admins,dc=example,dc=com" }, () => {
			const result = applyEnvOverrides({ ...DB_ROW });
			expect(result.admin_group).toBe("cn=env-admins,dc=example,dc=com");
		});
	});

	it("overrides user_group when LDAP_USER_GROUP is set", () => {
		withEnv({ LDAP_USER_GROUP: "cn=env-users,dc=example,dc=com" }, () => {
			const result = applyEnvOverrides({ ...DB_ROW });
			expect(result.user_group).toBe("cn=env-users,dc=example,dc=com");
		});
	});

	it("overrides user_filter when LDAP_SYNC_FILTER is set", () => {
		withEnv({ LDAP_SYNC_FILTER: "(&(objectClass=user)(objectCategory=person))" }, () => {
			const result = applyEnvOverrides({ ...DB_ROW });
			expect(result.user_filter).toBe("(&(objectClass=user)(objectCategory=person))");
		});
	});

	it("sets sync_group when LDAP_SYNC_GROUP is set", () => {
		withEnv({ LDAP_SYNC_GROUP: "cn=npm-sync,ou=Groups,dc=example,dc=com" }, () => {
			const result = applyEnvOverrides({ ...DB_ROW });
			expect(result.sync_group).toBe("cn=npm-sync,ou=Groups,dc=example,dc=com");
		});
	});

	it("LDAP_SYNC_FILTER overrides existing user_filter from DB", () => {
		withEnv({ LDAP_SYNC_FILTER: "(objectClass=inetOrgPerson)" }, () => {
			const result = applyEnvOverrides({ ...DB_ROW, user_filter: "(objectClass=user)" });
			expect(result.user_filter).toBe("(objectClass=inetOrgPerson)");
		});
	});

	it("LDAP_SYNC_FILTER is NOT applied when env var is empty string", () => {
		withEnv({ LDAP_SYNC_FILTER: "" }, () => {
			const result = applyEnvOverrides({ ...DB_ROW, user_filter: "(objectClass=user)" });
			expect(result.user_filter).toBe("(objectClass=user)");
		});
	});

	it("LDAP_SYNC_GROUP is NOT applied when env var is empty string", () => {
		withEnv({ LDAP_SYNC_GROUP: "" }, () => {
			const result = applyEnvOverrides({ ...DB_ROW });
			expect(result.sync_group).toBeUndefined();
		});
	});

	it("applies multiple overrides at once", () => {
		withEnv({
			LDAP_SERVER_URL:  "ldaps://multi.example.com",
			LDAP_BIND_DN:     "cn=multi-svc,dc=example,dc=com",
			LDAP_SEARCH_BASE: "dc=multi,dc=example,dc=com",
		}, () => {
			const result = applyEnvOverrides({ ...DB_ROW });
			expect(result.server_url).toBe("ldaps://multi.example.com");
			expect(result.bind_dn).toBe("cn=multi-svc,dc=example,dc=com");
			expect(result.search_base).toBe("dc=multi,dc=example,dc=com");
			// Non-overridden fields remain from DB
			expect(result.bind_password).toBe(DB_ROW.bind_password);
		});
	});
});

describe("applyEnvOverrides — boolean overrides", () => {
	// ── LDAP_ENABLED ──────────────────────────────────────────────────────

	it('parses LDAP_ENABLED="true" → true', () => {
		withEnv({ LDAP_ENABLED: "true" }, () => {
			expect(applyEnvOverrides({}).enabled).toBe(true);
		});
	});

	it('parses LDAP_ENABLED="1" → true', () => {
		withEnv({ LDAP_ENABLED: "1" }, () => {
			expect(applyEnvOverrides({}).enabled).toBe(true);
		});
	});

	it('parses LDAP_ENABLED="yes" → true', () => {
		withEnv({ LDAP_ENABLED: "yes" }, () => {
			expect(applyEnvOverrides({}).enabled).toBe(true);
		});
	});

	it('parses LDAP_ENABLED="on" → true', () => {
		withEnv({ LDAP_ENABLED: "on" }, () => {
			expect(applyEnvOverrides({}).enabled).toBe(true);
		});
	});

	it('parses LDAP_ENABLED="false" → false', () => {
		withEnv({ LDAP_ENABLED: "false" }, () => {
			expect(applyEnvOverrides({ enabled: true }).enabled).toBe(false);
		});
	});

	it('parses LDAP_ENABLED="0" → false', () => {
		withEnv({ LDAP_ENABLED: "0" }, () => {
			expect(applyEnvOverrides({ enabled: true }).enabled).toBe(false);
		});
	});

	it('parses LDAP_ENABLED="FALSE" (case-insensitive) → false', () => {
		withEnv({ LDAP_ENABLED: "FALSE" }, () => {
			expect(applyEnvOverrides({ enabled: true }).enabled).toBe(false);
		});
	});

	// ── LDAP_TLS_VERIFY ───────────────────────────────────────────────────

	it('sets tls_verify=false when LDAP_TLS_VERIFY="false"', () => {
		withEnv({ LDAP_TLS_VERIFY: "false" }, () => {
			const result = applyEnvOverrides({ ...DB_ROW });
			expect(result.tls_verify).toBe(false);
		});
	});

	it('sets tls_verify=true when LDAP_TLS_VERIFY="true"', () => {
		withEnv({ LDAP_TLS_VERIFY: "true" }, () => {
			const result = applyEnvOverrides({ ...DB_ROW, tls_verify: false });
			expect(result.tls_verify).toBe(true);
		});
	});

	// ── LDAP_STARTTLS ─────────────────────────────────────────────────────

	it('sets starttls=true when LDAP_STARTTLS="true"', () => {
		withEnv({ LDAP_STARTTLS: "true" }, () => {
			const result = applyEnvOverrides({ ...DB_ROW });
			expect(result.starttls).toBe(true);
		});
	});

	it('sets starttls=false when LDAP_STARTTLS="0"', () => {
		withEnv({ LDAP_STARTTLS: "0" }, () => {
			const result = applyEnvOverrides({ ...DB_ROW, starttls: true });
			expect(result.starttls).toBe(false);
		});
	});

	it('does NOT override boolean when env var is not defined (preserves DB value)', () => {
		// LDAP_ENABLED is unset — DB value should be preserved
		const result = applyEnvOverrides({ ...DB_ROW, enabled: false });
		expect(result.enabled).toBe(false);
	});
});

describe("applyEnvOverrides — precedence (env > DB)", () => {
	it("env value takes precedence over DB value for server_url", () => {
		withEnv({ LDAP_SERVER_URL: "ldaps://env-wins.example.com" }, () => {
			const result = applyEnvOverrides({ server_url: "ldap://db-loses.example.com" });
			expect(result.server_url).toBe("ldaps://env-wins.example.com");
		});
	});

	it("DB value is returned unchanged when no env vars are set", () => {
		const result = applyEnvOverrides({ ...DB_ROW });
		expect(result).toMatchObject(DB_ROW);
	});

	it("env string override is NOT applied when env var is empty string", () => {
		withEnv({ LDAP_SERVER_URL: "" }, () => {
			// Empty string → falsy → should not override
			const result = applyEnvOverrides({ server_url: "ldap://db.example.com" });
			expect(result.server_url).toBe("ldap://db.example.com");
		});
	});
});

describe("applyEnvOverrides — null / missing base row", () => {
	it("returns a valid config when row is null", () => {
		withEnv({ LDAP_SERVER_URL: "ldap://env.example.com" }, () => {
			const result = applyEnvOverrides(null);
			expect(result.server_url).toBe("ldap://env.example.com");
		});
	});

	it("returns an empty object when row is null and no env vars are set", () => {
		const result = applyEnvOverrides(null);
		expect(result).toEqual({});
	});

	it("does not mutate the original DB row object", () => {
		const original = { ...DB_ROW };
		const frozen   = Object.freeze(original);

		withEnv({ LDAP_SERVER_URL: "ldap://mutate-test.example.com" }, () => {
			// Should not throw even with a frozen object since applyEnvOverrides spreads
			expect(() => applyEnvOverrides(frozen)).not.toThrow();
		});
	});
});

// ---------------------------------------------------------------------------
// Tests — rowToLdapClientConfig
// ---------------------------------------------------------------------------

describe("rowToLdapClientConfig", () => {
	it("maps snake_case DB row to camelCase config", () => {
		const config = rowToLdapClientConfig(DB_ROW);
		expect(config).toMatchObject({
			serverUrl:     DB_ROW.server_url,
			bindDN:        DB_ROW.bind_dn,
			bindPassword:  DB_ROW.bind_password,
			searchBase:    DB_ROW.search_base,
			userAttribute: DB_ROW.user_attribute,
			tlsVerify:     true,
			starttls:      false,
		});
	});

	it("uses searchBase as groupDN fallback when group_dn is absent", () => {
		const rowNoGroupDN = { ...DB_ROW, group_dn: undefined };
		const config = rowToLdapClientConfig(rowNoGroupDN);
		expect(config.groupDN).toBe(DB_ROW.search_base);
	});

	it("uses group_dn when it is set", () => {
		const config = rowToLdapClientConfig(DB_ROW);
		expect(config.groupDN).toBe(DB_ROW.group_dn);
	});

	it("defaults userAttribute to 'uid' when user_attribute is absent", () => {
		const rowNoAttr = { ...DB_ROW, user_attribute: undefined };
		const config = rowToLdapClientConfig(rowNoAttr);
		expect(config.userAttribute).toBe("uid");
	});

	it("defaults tlsVerify to true when tls_verify is undefined", () => {
		const rowNoTls = { ...DB_ROW, tls_verify: undefined };
		const config = rowToLdapClientConfig(rowNoTls);
		expect(config.tlsVerify).toBe(true);
	});

	it("respects tls_verify=false", () => {
		const config = rowToLdapClientConfig({ ...DB_ROW, tls_verify: false });
		expect(config.tlsVerify).toBe(false);
	});

	it("returns empty strings for missing optional string fields", () => {
		const minimal = { server_url: "ldap://x.com", search_base: "dc=x,dc=com" };
		const config = rowToLdapClientConfig(minimal);
		expect(config.bindDN).toBe("");
		expect(config.bindPassword).toBe("");
	});
});

// ---------------------------------------------------------------------------
// Integration scenario: full env override workflow
// ---------------------------------------------------------------------------

describe("full override workflow", () => {
	it("env vars completely override a real DB row for Docker deployment", () => {
		withEnv({
			LDAP_ENABLED:       "true",
			LDAP_SERVER_URL:    "ldap://ldap:389",
			LDAP_BIND_DN:       "cn=admin,dc=example,dc=com",
			LDAP_BIND_PASSWORD: "docker-secret",
			LDAP_SEARCH_BASE:   "dc=example,dc=com",
			LDAP_USER_ATTR:     "uid",
			LDAP_TLS_VERIFY:    "false",
			LDAP_STARTTLS:      "false",
			LDAP_ADMIN_GROUP:   "cn=npm-admins,ou=Groups,dc=example,dc=com",
			LDAP_USER_GROUP:    "cn=npm-users,ou=Groups,dc=example,dc=com",
		}, () => {
			const merged = applyEnvOverrides(DB_ROW);
			expect(merged.enabled).toBe(true);
			expect(merged.server_url).toBe("ldap://ldap:389");
			expect(merged.bind_dn).toBe("cn=admin,dc=example,dc=com");
			expect(merged.bind_password).toBe("docker-secret");
			expect(merged.search_base).toBe("dc=example,dc=com");
			expect(merged.user_attribute).toBe("uid");
			expect(merged.tls_verify).toBe(false);
			expect(merged.starttls).toBe(false);
			expect(merged.admin_group).toBe("cn=npm-admins,ou=Groups,dc=example,dc=com");
			expect(merged.user_group).toBe("cn=npm-users,ou=Groups,dc=example,dc=com");

			// Then convert to camelCase for the LDAP client
			const clientConfig = rowToLdapClientConfig(merged);
			expect(clientConfig.serverUrl).toBe("ldap://ldap:389");
			expect(clientConfig.tlsVerify).toBe(false);
		});
	});
});
