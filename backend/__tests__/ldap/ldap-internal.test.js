/**
 * Unit tests for backend/internal/ldap.js (internalLdap)
 *
 * Run with Jest + ESM support:
 *   NODE_OPTIONS="--experimental-vm-modules" npx jest --no-coverage
 *
 * ldap-client.js is mocked — no real LDAP server required.
 *
 * Uses jest.unstable_mockModule() (correct ESM mocking) so factory functions
 * can close over test-scope mock variables.
 */

import { jest } from "@jest/globals";

// ---------------------------------------------------------------------------
// Shared mock objects
// ---------------------------------------------------------------------------

const mockLdapClientInstance = {
	bind:      jest.fn(),
	search:    jest.fn(),
	destroy:   jest.fn(),
	on:        jest.fn(),
	_destroyed: false,
};

const mockLdapClientCreate   = jest.fn();
const mockBorrowFromPool     = jest.fn();
const mockReturnToPool       = jest.fn();

// ---------------------------------------------------------------------------
// Module mocks — must be called BEFORE the dynamic import below
// ---------------------------------------------------------------------------

jest.unstable_mockModule("../../lib/ldap-client.js", () => ({
	default: {
		create:         mockLdapClientCreate,
		mapLdapError:   (err) => err?.message || "LDAP error",
		borrowFromPool: mockBorrowFromPool,
		returnToPool:   mockReturnToPool,
	},
	mapLdapError:   (err) => err?.message || "LDAP error",
	borrowFromPool: mockBorrowFromPool,
	returnToPool:   mockReturnToPool,
}));

jest.unstable_mockModule("../../logger.js", () => ({
	ldap:   { debug: jest.fn(), warn: jest.fn(), info: jest.fn(), error: jest.fn() },
	global: { debug: jest.fn(), warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

jest.unstable_mockModule("../../lib/error.js", () => ({
	default: {
		AuthError:       class AuthError extends Error {
			constructor(msg) { super(msg); this.name = "AuthError"; }
		},
		ValidationError: class ValidationError extends Error {
			constructor(msg) { super(msg); this.name = "ValidationError"; }
		},
	},
}));

// ---------------------------------------------------------------------------
// Dynamic import — AFTER all unstable_mockModule() registrations
// ---------------------------------------------------------------------------

let internalLdap;
beforeAll(async () => {
	({ default: internalLdap } = await import("../../internal/ldap.js"));
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_CONFIG = {
	serverUrl:     "ldap://dc.example.com",
	bindDN:        "cn=service,dc=example,dc=com",
	bindPassword:  "svc-password",
	searchBase:    "dc=example,dc=com",
	groupDN:       "ou=Groups,dc=example,dc=com",
	userAttribute: "uid",
	tlsVerify:     true,
	starttls:      false,
};

const ALICE_ENTRY = {
	dn:          "uid=alice,ou=Users,dc=example,dc=com",
	uid:         "alice",
	mail:        "alice@example.com",
	displayName: "Alice Smith",
	givenName:   "Alice",
	sn:          "Smith",
	memberOf:    [
		"cn=npm-admins,ou=Groups,dc=example,dc=com",
		"cn=npm-users,ou=Groups,dc=example,dc=com",
	],
};

// ---------------------------------------------------------------------------
// Before each test: reset mock state
// ---------------------------------------------------------------------------

beforeEach(() => {
	jest.clearAllMocks();

	mockBorrowFromPool.mockResolvedValue(mockLdapClientInstance);
	mockReturnToPool.mockReturnValue(undefined);

	mockLdapClientInstance.search.mockResolvedValue([]);
	mockLdapClientCreate.mockResolvedValue({ ...mockLdapClientInstance, destroy: jest.fn() });
});

// ── testConnection ────────────────────────────────────────────────────────

describe("internalLdap.testConnection", () => {
	it("returns success when LdapClient.create resolves", async () => {
		const result = await internalLdap.testConnection(BASE_CONFIG);
		expect(result.success).toBe(true);
		expect(result.message).toMatch(/success/i);
	});

	it("returns failure when LdapClient.create rejects", async () => {
		mockLdapClientCreate.mockRejectedValue(new Error("Connection refused"));
		const result = await internalLdap.testConnection(BASE_CONFIG);
		expect(result.success).toBe(false);
		expect(result.message).toMatch(/connection refused/i);
	});

	it("includes the error message in the failure response", async () => {
		mockLdapClientCreate.mockRejectedValue(new Error("Invalid credentials — check bind DN and password"));
		const result = await internalLdap.testConnection(BASE_CONFIG);
		expect(result.message).toContain("Invalid credentials");
	});
});

// ── searchUser ────────────────────────────────────────────────────────────

describe("internalLdap.searchUser", () => {
	it("returns the user entry when found", async () => {
		mockLdapClientInstance.search.mockResolvedValue([ALICE_ENTRY]);
		const result = await internalLdap.searchUser(BASE_CONFIG, "alice");
		expect(result).toEqual(ALICE_ENTRY);
	});

	it("returns null when no entries match", async () => {
		mockLdapClientInstance.search.mockResolvedValue([]);
		const result = await internalLdap.searchUser(BASE_CONFIG, "nobody");
		expect(result).toBeNull();
	});

	it("uses the configured userAttribute in the search filter", async () => {
		const adConfig = { ...BASE_CONFIG, userAttribute: "sAMAccountName" };
		await internalLdap.searchUser(adConfig, "alice");

		const searchCall = mockLdapClientInstance.search.mock.calls[0];
		const opts       = searchCall[1];
		expect(opts.filter).toContain("sAMAccountName=alice");
	});

	it("defaults to uid attribute when userAttribute is not set", async () => {
		const cfgNoAttr = { ...BASE_CONFIG, userAttribute: undefined };
		await internalLdap.searchUser(cfgNoAttr, "bob");

		const [, opts] = mockLdapClientInstance.search.mock.calls[0];
		expect(opts.filter).toContain("uid=bob");
	});

	it("escapes special characters in the username", async () => {
		await internalLdap.searchUser(BASE_CONFIG, "user(with)parens");
		const [, opts] = mockLdapClientInstance.search.mock.calls[0];
		expect(opts.filter).not.toContain("(with)");
	});

	it("returns first entry when multiple results are found (ambiguity)", async () => {
		mockLdapClientInstance.search.mockResolvedValue([ALICE_ENTRY, { ...ALICE_ENTRY, uid: "alice2" }]);
		const result = await internalLdap.searchUser(BASE_CONFIG, "alice");
		expect(result).toEqual(ALICE_ENTRY);
	});

	it("throws AuthError when the LDAP search itself fails", async () => {
		mockLdapClientInstance.search.mockRejectedValue(new Error("LDAP unavailable"));
		await expect(internalLdap.searchUser(BASE_CONFIG, "alice")).rejects.toThrow();
	});

	it("searches using mail attribute config", async () => {
		const mailCfg = { ...BASE_CONFIG, userAttribute: "mail" };
		await internalLdap.searchUser(mailCfg, "alice@example.com");

		const [, opts] = mockLdapClientInstance.search.mock.calls[0];
		expect(opts.filter).toContain("mail=alice@example.com");
	});

	it("searches using userPrincipalName for AD UPN logins", async () => {
		const adCfg = { ...BASE_CONFIG, userAttribute: "userPrincipalName" };
		await internalLdap.searchUser(adCfg, "alice@corp.example.com");

		const [, opts] = mockLdapClientInstance.search.mock.calls[0];
		expect(opts.filter).toContain("userPrincipalName=alice@corp.example.com");
	});
});

// ── authenticateUser ──────────────────────────────────────────────────────

describe("internalLdap.authenticateUser", () => {
	it("resolves with user attributes on successful bind", async () => {
		mockLdapClientInstance.search.mockResolvedValue([ALICE_ENTRY]);
		mockLdapClientCreate.mockResolvedValue({ destroy: jest.fn() });

		const result = await internalLdap.authenticateUser(BASE_CONFIG, "alice", "alice123");
		expect(result).toEqual(ALICE_ENTRY);
	});

	it("throws AuthError when user is not found", async () => {
		mockLdapClientInstance.search.mockResolvedValue([]);
		await expect(
			internalLdap.authenticateUser(BASE_CONFIG, "ghost", "password"),
		).rejects.toThrow(/invalid credentials/i);
	});

	it("throws AuthError when the user bind fails (wrong password)", async () => {
		mockLdapClientInstance.search.mockResolvedValue([ALICE_ENTRY]);
		mockLdapClientCreate.mockRejectedValue(
			Object.assign(new Error("invalidCredentials"), { code: 49 }),
		);

		await expect(
			internalLdap.authenticateUser(BASE_CONFIG, "alice", "wrongpassword"),
		).rejects.toThrow(/invalid credentials/i);
	});

	it("throws AuthError when username is empty", async () => {
		await expect(
			internalLdap.authenticateUser(BASE_CONFIG, "", "pass"),
		).rejects.toThrow();
	});

	it("throws AuthError when password is empty", async () => {
		await expect(
			internalLdap.authenticateUser(BASE_CONFIG, "alice", ""),
		).rejects.toThrow();
	});

	it("uses the user's DN for the bind, not the service account DN", async () => {
		mockLdapClientInstance.search.mockResolvedValue([ALICE_ENTRY]);
		mockLdapClientCreate.mockResolvedValue({ destroy: jest.fn() });

		await internalLdap.authenticateUser(BASE_CONFIG, "alice", "alice123");

		const lastCall = mockLdapClientCreate.mock.calls[mockLdapClientCreate.mock.calls.length - 1][0];
		expect(lastCall.bindDN).toBe(ALICE_ENTRY.dn);
	});

	it("destroys the user-bind client after successful authentication", async () => {
		const mockUserClient = { destroy: jest.fn() };
		mockLdapClientInstance.search.mockResolvedValue([ALICE_ENTRY]);
		mockLdapClientCreate.mockResolvedValue(mockUserClient);

		await internalLdap.authenticateUser(BASE_CONFIG, "alice", "alice123");
		expect(mockUserClient.destroy).toHaveBeenCalledTimes(1);
	});
});

// ── getUserGroups ─────────────────────────────────────────────────────────

describe("internalLdap.getUserGroups", () => {
	const ALICE_DN = "uid=alice,ou=Users,dc=example,dc=com";

	it("returns group entries when AD memberOf-style groups are found", async () => {
		const groups = [
			{ dn: "cn=npm-admins,ou=Groups,dc=example,dc=com", cn: "npm-admins" },
			{ dn: "cn=npm-users,ou=Groups,dc=example,dc=com",  cn: "npm-users" },
		];
		mockLdapClientInstance.search.mockResolvedValue(groups);

		const result = await internalLdap.getUserGroups(BASE_CONFIG, ALICE_DN, "alice");
		expect(result).toEqual(groups);
	});

	it("builds a filter that includes (member=<DN>)", async () => {
		await internalLdap.getUserGroups(BASE_CONFIG, ALICE_DN, "alice");
		const [, opts] = mockLdapClientInstance.search.mock.calls[0];
		expect(opts.filter).toContain(`member=${ALICE_DN}`);
	});

	it("builds a filter that includes (memberUid=<username>) for POSIX groups", async () => {
		await internalLdap.getUserGroups(BASE_CONFIG, ALICE_DN, "alice");
		const [, opts] = mockLdapClientInstance.search.mock.calls[0];
		expect(opts.filter).toContain("memberUid=alice");
	});

	it("builds a filter that includes (uniqueMember=<DN>) for RFC 2307bis", async () => {
		await internalLdap.getUserGroups(BASE_CONFIG, ALICE_DN);
		const [, opts] = mockLdapClientInstance.search.mock.calls[0];
		expect(opts.filter).toContain(`uniqueMember=${ALICE_DN}`);
	});

	it("uses groupDN as search base when configured", async () => {
		await internalLdap.getUserGroups(BASE_CONFIG, ALICE_DN, "alice");
		const [base] = mockLdapClientInstance.search.mock.calls[0];
		expect(base).toBe(BASE_CONFIG.groupDN);
	});

	it("falls back to searchBase when groupDN is not configured", async () => {
		const cfgNoGroup = { ...BASE_CONFIG, groupDN: undefined };
		await internalLdap.getUserGroups(cfgNoGroup, ALICE_DN, "alice");
		const [base] = mockLdapClientInstance.search.mock.calls[0];
		expect(base).toBe(BASE_CONFIG.searchBase);
	});

	it("returns empty array (not throw) when group search fails", async () => {
		mockLdapClientInstance.search.mockRejectedValue(new Error("Group search error"));
		const result = await internalLdap.getUserGroups(BASE_CONFIG, ALICE_DN, "alice");
		expect(result).toEqual([]);
	});

	it("returns empty array when user has no group memberships", async () => {
		mockLdapClientInstance.search.mockResolvedValue([]);
		const result = await internalLdap.getUserGroups(BASE_CONFIG, ALICE_DN, "alice");
		expect(result).toEqual([]);
	});
});

// ── normalizeUser ─────────────────────────────────────────────────────────

describe("internalLdap.normalizeUser", () => {
	it("maps uid-based entries correctly", () => {
		const normalized = internalLdap.normalizeUser(ALICE_ENTRY, "uid");
		expect(normalized).toMatchObject({
			dn:          ALICE_ENTRY.dn,
			username:    "alice",
			email:       "alice@example.com",
			displayName: "Alice Smith",
			givenName:   "Alice",
			surname:     "Smith",
			memberOf:    ALICE_ENTRY.memberOf,
		});
	});

	it("maps sAMAccountName for Active Directory entries", () => {
		const adEntry = {
			dn:               "CN=Alice,CN=Users,DC=corp,DC=example,DC=com",
			sAMAccountName:   "alice",
			mail:             "alice@corp.example.com",
			displayName:      "Alice Smith",
			givenName:        "Alice",
			sn:               "Smith",
			memberOf:         ["CN=Domain Admins,CN=Users,DC=corp,DC=example,DC=com"],
		};

		const normalized = internalLdap.normalizeUser(adEntry, "sAMAccountName");
		expect(normalized.username).toBe("alice");
		expect(normalized.email).toBe("alice@corp.example.com");
	});

	it("falls back to userPrincipalName when mail is absent", () => {
		const entry = {
			...ALICE_ENTRY,
			mail:                undefined,
			userPrincipalName:   "alice@corp.example.com",
		};
		const normalized = internalLdap.normalizeUser(entry, "uid");
		expect(normalized.email).toBe("alice@corp.example.com");
	});

	it("uses cn as displayName fallback when displayName is absent", () => {
		const entry = { ...ALICE_ENTRY, displayName: undefined, cn: "Alice Smith" };
		const normalized = internalLdap.normalizeUser(entry, "uid");
		expect(normalized.displayName).toBe("Alice Smith");
	});

	it("wraps a single memberOf string into an array", () => {
		const entry = { ...ALICE_ENTRY, memberOf: "cn=npm-users,ou=Groups,dc=example,dc=com" };
		const normalized = internalLdap.normalizeUser(entry, "uid");
		expect(Array.isArray(normalized.memberOf)).toBe(true);
		expect(normalized.memberOf).toHaveLength(1);
	});

	it("returns empty memberOf array when memberOf is absent", () => {
		const entry = { ...ALICE_ENTRY, memberOf: undefined };
		const normalized = internalLdap.normalizeUser(entry, "uid");
		expect(normalized.memberOf).toEqual([]);
	});

	it("defaults userAttribute to uid when not passed", () => {
		const normalized = internalLdap.normalizeUser(ALICE_ENTRY);
		expect(normalized.username).toBe("alice");
	});
});

// ── validateConfig ────────────────────────────────────────────────────────

describe("internalLdap.validateConfig", () => {
	it("passes for a valid ldap:// config", () => {
		expect(() => internalLdap.validateConfig(BASE_CONFIG)).not.toThrow();
	});

	it("passes for a valid ldaps:// config", () => {
		expect(() =>
			internalLdap.validateConfig({ ...BASE_CONFIG, serverUrl: "ldaps://dc.example.com" }),
		).not.toThrow();
	});

	it("throws ValidationError when serverUrl is missing", () => {
		expect(() =>
			internalLdap.validateConfig({ ...BASE_CONFIG, serverUrl: "" }),
		).toThrow();
	});

	it("throws ValidationError when searchBase is missing", () => {
		expect(() =>
			internalLdap.validateConfig({ ...BASE_CONFIG, searchBase: "" }),
		).toThrow();
	});

	it("throws ValidationError for invalid URL scheme", () => {
		expect(() =>
			internalLdap.validateConfig({ ...BASE_CONFIG, serverUrl: "http://dc.example.com" }),
		).toThrow();
	});

	it("throws ValidationError when STARTTLS is combined with ldaps://", () => {
		expect(() =>
			internalLdap.validateConfig({
				...BASE_CONFIG,
				serverUrl: "ldaps://dc.example.com",
				starttls:  true,
			}),
		).toThrow(/STARTTLS.*ldaps/i);
	});
});

// ── isUserInGroup ─────────────────────────────────────────────────────────

describe("internalLdap.isUserInGroup", () => {
	const USER_DN   = "uid=alice,ou=Users,dc=example,dc=com";
	const ADMIN_GRP = "cn=npm-admins,ou=Groups,dc=example,dc=com";

	beforeEach(() => {
		mockLdapClientInstance.search.mockResolvedValue([
			{ dn: ADMIN_GRP,                                       cn: "npm-admins" },
			{ dn: "cn=npm-users,ou=Groups,dc=example,dc=com",     cn: "npm-users" },
		]);
	});

	it("returns true when user is in the specified group (exact DN match)", async () => {
		const result = await internalLdap.isUserInGroup(BASE_CONFIG, USER_DN, ADMIN_GRP);
		expect(result).toBe(true);
	});

	it("returns true when matching by CN only (short name)", async () => {
		const result = await internalLdap.isUserInGroup(BASE_CONFIG, USER_DN, "npm-admins");
		expect(result).toBe(true);
	});

	it("returns false when user is NOT in the specified group", async () => {
		const result = await internalLdap.isUserInGroup(BASE_CONFIG, USER_DN, "cn=super-admins,ou=Groups,dc=example,dc=com");
		expect(result).toBe(false);
	});

	it("returns false when getUserGroups returns empty (lookup failure)", async () => {
		mockLdapClientInstance.search.mockRejectedValue(new Error("Group search error"));
		const result = await internalLdap.isUserInGroup(BASE_CONFIG, USER_DN, ADMIN_GRP);
		expect(result).toBe(false);
	});
});

// ── withServiceClient — semaphore release on error ────────────────────────
//
// Regression test for: catch block calling client.destroy() without
// returnToPool(), permanently leaking one semaphore slot per failed
// LDAP operation (fix: try/finally always calls returnToPool()).

describe("withServiceClient — semaphore slot released on failed LDAP operation", () => {
	it("calls returnToPool even when the LDAP operation throws", async () => {
		// Arrange: make the search (i.e. the fn passed to withServiceClient) reject
		mockLdapClientInstance.search.mockRejectedValue(new Error("LDAP unavailable"));

		// Act: searchUser wraps its LDAP call in withServiceClient
		await expect(internalLdap.searchUser(BASE_CONFIG, "alice")).rejects.toThrow();

		// Assert: returnToPool MUST have been called so the semaphore slot is freed.
		// Pre-fix behaviour: returnToPool was never called → semaphore leaked.
		expect(mockReturnToPool).toHaveBeenCalledTimes(1);
		expect(mockReturnToPool).toHaveBeenCalledWith(BASE_CONFIG, mockLdapClientInstance);
	});

	it("calls client.destroy() before returnToPool on error (connection marked dead first)", async () => {
		mockLdapClientInstance.search.mockRejectedValue(new Error("Network error"));

		await expect(internalLdap.searchUser(BASE_CONFIG, "alice")).rejects.toThrow();

		// destroy() must be called — connection state is unknown after an error
		expect(mockLdapClientInstance.destroy).toHaveBeenCalledTimes(1);
		// returnToPool must also be called — to release the semaphore slot
		expect(mockReturnToPool).toHaveBeenCalledTimes(1);
	});

	it("does NOT call returnToPool twice on success (slot returned once)", async () => {
		// Arrange: successful operation
		mockLdapClientInstance.search.mockResolvedValue([]);

		await internalLdap.searchUser(BASE_CONFIG, "alice");

		// returnToPool should be called exactly once on success (normal path)
		expect(mockReturnToPool).toHaveBeenCalledTimes(1);
		// destroy() must NOT be called on success
		expect(mockLdapClientInstance.destroy).not.toHaveBeenCalled();
	});
});
