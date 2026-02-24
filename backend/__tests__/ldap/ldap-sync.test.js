/**
 * Unit tests for backend/internal/ldap-sync.js (ldapSync)
 *
 * Run with Jest + ESM support:
 *   NODE_OPTIONS="--experimental-vm-modules" npx jest --no-coverage
 *
 * All models and internalLdap are mocked — no real DB or LDAP required.
 *
 * Uses jest.unstable_mockModule() (correct ESM mocking) so factory functions
 * can close over test-scope mock variables.
 */

import { jest } from "@jest/globals";

// ---------------------------------------------------------------------------
// Shared mock objects — defined before jest.unstable_mockModule() calls so
// factory closures can reference them.
// ---------------------------------------------------------------------------

// ── userModel ──
const mockUserQuery = {
	where:         jest.fn(),
	first:         jest.fn(),
	findById:      jest.fn(),
	patch:         jest.fn(),      // patch({...}).where('id', x)
	patchById:     jest.fn(),      // kept for compat with any remaining callsites
	insertAndFetch:jest.fn(),
	insert:        jest.fn(),
	orderBy:       jest.fn(),
	limit:         jest.fn(),
	offset:        jest.fn(),
	select:        jest.fn(),
};
// Chain-returning setup is done in beforeEach (see below) so clearAllMocks
// doesn't leave the chain broken.

const mockUserModel = { query: jest.fn(() => mockUserQuery) };

// ── authModel ──
const mockAuthQuery = {
	where:  jest.fn(),
	first:  jest.fn(),
	insert: jest.fn(),
};
const mockAuthModel = { query: jest.fn(() => mockAuthQuery) };

// ── auditLogModel ──
const mockAuditQuery = { insert: jest.fn() };
const mockAuditModel = { query: jest.fn(() => mockAuditQuery) };

// ── userPermissionModel ──
const mockPermQuery = {
	where:    jest.fn(),
	first:    jest.fn(),
	insert:   jest.fn(),
	patch:    jest.fn(),
	patchById:jest.fn(),
};
const mockPermModel = { query: jest.fn(() => mockPermQuery) };

// ── LdapConfig ──
const mockLdapConfigQuery = { where: jest.fn(), first: jest.fn() };
const mockLdapConfigModel = { query: jest.fn(() => mockLdapConfigQuery) };

// ── internalLdap ──
const mockInternalLdap = {
	getUserGroups:   jest.fn(),
	searchUser:      jest.fn(),
	authenticateUser:jest.fn(),
	normalizeUser:   jest.fn(),
	searchAllUsers:  jest.fn(),
};

// ---------------------------------------------------------------------------
// Module mocks — must be called BEFORE the dynamic import below
// ---------------------------------------------------------------------------

jest.unstable_mockModule("../../models/user.js",          () => ({ default: mockUserModel }));
jest.unstable_mockModule("../../models/auth.js",          () => ({ default: mockAuthModel }));
jest.unstable_mockModule("../../models/audit-log.js",     () => ({ default: mockAuditModel }));
jest.unstable_mockModule("../../models/user_permission.js",() => ({ default: mockPermModel }));
jest.unstable_mockModule("../../models/ldap_config.js",   () => ({ default: mockLdapConfigModel }));

jest.unstable_mockModule("../../models/now_helper.js", () => ({
	default: jest.fn(() => new Date().toISOString()),
}));

jest.unstable_mockModule("gravatar", () => ({
	default: { url: jest.fn(() => "https://www.gravatar.com/avatar/test") },
}));

jest.unstable_mockModule("../../logger.js", () => ({
	ldap:   { debug: jest.fn(), warn: jest.fn(), info: jest.fn(), error: jest.fn() },
	global: { debug: jest.fn(), warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

jest.unstable_mockModule("../../internal/ldap.js", () => ({
	default: mockInternalLdap,
}));

jest.unstable_mockModule("../../lib/ldap-env.js", () => ({
	applyEnvOverrides: jest.fn((row) => row),
}));

// ---------------------------------------------------------------------------
// Dynamic import — AFTER all unstable_mockModule() registrations
// ---------------------------------------------------------------------------

let ldapSync;
beforeAll(async () => {
	({ default: ldapSync } = await import("../../internal/ldap-sync.js"));
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LDAP_CONFIG_DB = {
	id:            1,
	enabled:       1,
	server_url:    "ldap://dc.example.com",
	bind_dn:       "cn=svc,dc=example,dc=com",
	bind_password: "svc-pass",
	search_base:   "dc=example,dc=com",
	group_dn:      "ou=Groups,dc=example,dc=com",
	user_attribute:"uid",
	admin_group:   "cn=npm-admins,ou=Groups,dc=example,dc=com",
	user_group:    "cn=npm-users,ou=Groups,dc=example,dc=com",
	tls_verify:    1,
	starttls:      0,
	page_size:     0,  // 0 = use default (500)
};

const LDAP_USER = {
	dn:          "uid=alice,ou=Users,dc=example,dc=com",
	username:    "alice",
	email:       "alice@example.com",
	displayName: "Alice Smith",
	givenName:   "Alice",
	surname:     "Smith",
	memberOf:    [],
};

const ALICE_LDAP_ENTRY = {
	dn:          "uid=alice,ou=Users,dc=example,dc=com",
	mail:        "alice@example.com",
	displayName: "Alice Smith",
	givenName:   "Alice",
	sn:          "Smith",
	uid:         "alice",
};

const ADMIN_GROUPS  = ["cn=npm-admins,ou=Groups,dc=example,dc=com", "cn=npm-users,ou=Groups,dc=example,dc=com"];
const USER_GROUPS   = ["cn=npm-users,ou=Groups,dc=example,dc=com"];
const NO_GROUPS     = [];

/** Helper: create a fake NPM user row */
const makeNpmUser = (overrides = {}) => ({
	id:          42,
	email:       "alice@example.com",
	name:        "Alice Smith",
	nickname:    "alice",
	roles:       [],
	is_disabled: 0,
	is_deleted:  0,
	auth_source: "ldap",
	...overrides,
});

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/** Re-apply chainable return values after clearAllMocks resets mock state. */
const restoreChains = () => {
	["where", "patch", "orderBy", "limit", "offset", "select"].forEach(
		(m) => mockUserQuery[m].mockReturnValue(mockUserQuery),
	);
	mockPermQuery.patch.mockReturnValue(mockPermQuery);
	mockPermQuery.where.mockReturnValue(mockPermQuery);
	mockAuthQuery.where.mockReturnValue(mockAuthQuery);
	mockLdapConfigQuery.where.mockReturnValue(mockLdapConfigQuery);
};

beforeEach(() => {
	jest.clearAllMocks();
	restoreChains();

	// Default: user does NOT exist yet (provisionUser creates new)
	mockUserQuery.first.mockResolvedValue(null);
	mockUserQuery.findById.mockResolvedValue(makeNpmUser());
	mockUserQuery.insertAndFetch.mockImplementation((data) =>
		Promise.resolve({ id: 42, ...data }),
	);
	mockUserQuery.patchById.mockResolvedValue(1);
	// select() resolves with empty array (no absent users to disable)
	mockUserQuery.select.mockResolvedValue([]);

	mockAuthQuery.first.mockResolvedValue(null);
	mockAuthQuery.insert.mockResolvedValue({ id: 1 });

	mockPermQuery.first.mockResolvedValue(null);
	mockPermQuery.insert.mockResolvedValue({ id: 1 });
	mockPermQuery.patchById.mockResolvedValue(1);

	mockAuditQuery.insert.mockResolvedValue({ id: 1 });

	// Default: LdapConfig is enabled
	mockLdapConfigQuery.first.mockResolvedValue(LDAP_CONFIG_DB);

	// Default: searchAllUsers calls pageHandler with an empty page (no users)
	mockInternalLdap.searchAllUsers.mockImplementation(async () => {});

	// Default: normalizeUser returns the standard LDAP_USER fixture
	mockInternalLdap.normalizeUser.mockReturnValue(LDAP_USER);

	// Default: getUserGroups returns npm-users group
	mockInternalLdap.getUserGroups.mockResolvedValue([
		{ dn: "cn=npm-users,ou=Groups,dc=example,dc=com" },
	]);
});

// ── provisionUser — new user creation (JIT provisioning) ─────────────────

describe("ldapSync.provisionUser — new user", () => {
	it("creates a new NPM user when none exists", async () => {
		const user = await ldapSync.provisionUser(LDAP_USER, LDAP_CONFIG_DB, ADMIN_GROUPS);

		expect(mockUserQuery.insertAndFetch).toHaveBeenCalledWith(
			expect.objectContaining({
				email:       "alice@example.com",
				auth_source: "ldap",
			}),
		);
		expect(user.id).toBe(42);
	});

	it("creates auth record with type=ldap and ldap_dn", async () => {
		await ldapSync.provisionUser(LDAP_USER, LDAP_CONFIG_DB, ADMIN_GROUPS);

		expect(mockAuthQuery.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				type:    "ldap",
				ldap_dn: LDAP_USER.dn,
				secret:  null,
			}),
		);
	});

	it("creates default permissions row for new user", async () => {
		await ldapSync.provisionUser(LDAP_USER, LDAP_CONFIG_DB, ADMIN_GROUPS);
		expect(mockPermQuery.insert).toHaveBeenCalled();
	});

	it("assigns admin role when user is in admin group", async () => {
		await ldapSync.provisionUser(LDAP_USER, LDAP_CONFIG_DB, ADMIN_GROUPS);

		expect(mockUserQuery.insertAndFetch).toHaveBeenCalledWith(
			expect.objectContaining({ roles: ["admin"] }),
		);
	});

	it("assigns no roles when user is only in user group (not admin)", async () => {
		await ldapSync.provisionUser(LDAP_USER, LDAP_CONFIG_DB, USER_GROUPS);

		expect(mockUserQuery.insertAndFetch).toHaveBeenCalledWith(
			expect.objectContaining({ roles: [] }),
		);
	});

	it("throws when user has no email address", async () => {
		const noEmailUser = { ...LDAP_USER, email: "" };
		await expect(ldapSync.provisionUser(noEmailUser, LDAP_CONFIG_DB, ADMIN_GROUPS)).rejects.toThrow(
			/no email/i,
		);
	});

	it("throws when user is not in any required user group", async () => {
		const restrictedConfig = {
			...LDAP_CONFIG_DB,
			user_group: "cn=npm-users,ou=Groups,dc=example,dc=com",
		};

		await expect(ldapSync.provisionUser(LDAP_USER, restrictedConfig, NO_GROUPS)).rejects.toThrow(
			/required LDAP group/i,
		);
	});

	it("allows access when no user_group restriction is configured", async () => {
		const noGroupConfig = { ...LDAP_CONFIG_DB, user_group: null, admin_group: null };
		await expect(ldapSync.provisionUser(LDAP_USER, noGroupConfig, NO_GROUPS)).resolves.toBeDefined();
	});

	it("writes an audit log entry on new user creation", async () => {
		await ldapSync.provisionUser(LDAP_USER, LDAP_CONFIG_DB, ADMIN_GROUPS);
		expect(mockAuditQuery.insert).toHaveBeenCalledWith(
			expect.objectContaining({ action: "ldap_user_provisioned" }),
		);
	});
});

// ── provisionUser — existing user update ──────────────────────────────────

describe("ldapSync.provisionUser — existing LDAP user", () => {
	beforeEach(() => {
		// Simulate user already exists in DB
		mockUserQuery.first.mockResolvedValue(makeNpmUser());
	});

	it("updates name/nickname for existing LDAP user", async () => {
		await ldapSync.provisionUser(LDAP_USER, LDAP_CONFIG_DB, USER_GROUPS);

		// patch() should have been called with the name update
		expect(mockUserQuery.patch).toHaveBeenCalledWith(
			expect.objectContaining({
				name:     "Alice Smith",
				nickname: "alice",
			}),
		);
	});

	it("does NOT call insertAndFetch for existing user", async () => {
		await ldapSync.provisionUser(LDAP_USER, LDAP_CONFIG_DB, USER_GROUPS);
		expect(mockUserQuery.insertAndFetch).not.toHaveBeenCalled();
	});

	it("re-enables a previously disabled user who rejoined the allowed group", async () => {
		mockUserQuery.first.mockResolvedValue(makeNpmUser({ is_disabled: 1 }));

		await ldapSync.provisionUser(LDAP_USER, LDAP_CONFIG_DB, USER_GROUPS);

		expect(mockUserQuery.patch).toHaveBeenCalledWith(
			expect.objectContaining({ is_disabled: 0 }),
		);
	});

	it("throws when a local user has the same email as the LDAP user (security: prevents hijacking)", async () => {
		// SECURITY: an existing local account with the same email must NOT be
		// returned to the LDAP login flow — that would hijack the local account.
		mockUserQuery.first.mockResolvedValue(makeNpmUser({ auth_source: "local" }));

		await expect(
			ldapSync.provisionUser(LDAP_USER, LDAP_CONFIG_DB, USER_GROUPS),
		).rejects.toThrow(/different authentication source/i);
	});
});

// ── Cross-source binding prevention (security tests) ──────────────────────

describe("ldapSync.provisionUser — cross-source binding prevention", () => {
	/**
	 * SECURITY: An LDAP user logging in with the same email address as an
	 * existing local (password-based) account MUST NOT gain access to that
	 * account. The fix: provisionUser throws when auth_source != 'ldap'.
	 */
	it("LDAP login with same email as local account throws — does NOT hijack", async () => {
		const localUser = makeNpmUser({
			auth_source: "local",
			email: "alice@example.com",
		});
		mockUserQuery.first.mockResolvedValue(localUser);

		await expect(
			ldapSync.provisionUser(LDAP_USER, LDAP_CONFIG_DB, USER_GROUPS),
		).rejects.toThrow(
			/different authentication source/i,
		);

		// The local user record must NOT have been modified
		expect(mockUserQuery.patch).not.toHaveBeenCalledWith(
			expect.objectContaining({ name: "Alice Smith" }),
		);
		// No auth record must be created for the local account
		expect(mockAuthQuery.insert).not.toHaveBeenCalled();
	});

	it("LDAP login must not match auth_source='other' accounts either", async () => {
		const otherSourceUser = makeNpmUser({
			auth_source: "oauth",
			email: "alice@example.com",
		});
		mockUserQuery.first.mockResolvedValue(otherSourceUser);

		await expect(
			ldapSync.provisionUser(LDAP_USER, LDAP_CONFIG_DB, USER_GROUPS),
		).rejects.toThrow();
	});

	it("LDAP login succeeds when user already exists with auth_source=ldap", async () => {
		const ldapUser = makeNpmUser({ auth_source: "ldap" });
		mockUserQuery.first.mockResolvedValue(ldapUser);
		// findById returns the same user for the refresh step
		mockUserQuery.findById.mockResolvedValue(ldapUser);

		await expect(
			ldapSync.provisionUser(LDAP_USER, LDAP_CONFIG_DB, USER_GROUPS),
		).resolves.toBeDefined();
	});

	it("LDAP login succeeds when no user exists yet (creates new ldap user)", async () => {
		mockUserQuery.first.mockResolvedValue(null);  // no user with this email

		const user = await ldapSync.provisionUser(LDAP_USER, LDAP_CONFIG_DB, USER_GROUPS);

		expect(user.auth_source).toBe("ldap");
		expect(mockUserQuery.insertAndFetch).toHaveBeenCalledWith(
			expect.objectContaining({ auth_source: "ldap" }),
		);
	});

	it("does NOT touch an existing local account when LDAP login fails", async () => {
		// A local account with a matching email
		const localUser = makeNpmUser({
			id: 99,
			auth_source: "local",
			email: "alice@example.com",
		});
		mockUserQuery.first.mockResolvedValue(localUser);

		let thrownError;
		try {
			await ldapSync.provisionUser(LDAP_USER, LDAP_CONFIG_DB, USER_GROUPS);
		} catch (err) {
			thrownError = err;
		}

		// Must have thrown
		expect(thrownError).toBeDefined();
		expect(thrownError.message).toMatch(/different authentication source/i);

		// The local account must not have been patched, re-enabled, or have new auth records
		expect(mockUserQuery.patch).not.toHaveBeenCalled();
		expect(mockUserQuery.insertAndFetch).not.toHaveBeenCalled();
		expect(mockAuthQuery.insert).not.toHaveBeenCalled();
	});
});

// ── disableUser ───────────────────────────────────────────────────────────

describe("ldapSync.disableUser", () => {
	it("sets is_disabled=1 on the user record", async () => {
		await ldapSync.disableUser(42, "Removed from LDAP group");

		expect(mockUserQuery.patch).toHaveBeenCalledWith(
			expect.objectContaining({ is_disabled: 1 }),
		);
	});

	it("writes a ldap_user_disabled audit log entry", async () => {
		await ldapSync.disableUser(42, "Removed from LDAP group");

		expect(mockAuditQuery.insert).toHaveBeenCalledWith(
			expect.objectContaining({ action: "ldap_user_disabled" }),
		);
	});
});

// ── syncUserGroups ────────────────────────────────────────────────────────

describe("ldapSync.syncUserGroups", () => {
	beforeEach(() => {
		// By default: user exists, is enabled, non-admin
		mockUserQuery.findById.mockResolvedValue(makeNpmUser({ roles: [] }));
		mockPermQuery.first.mockResolvedValue({ id: 10, visibility: "user" });
	});

	it("promotes user to admin when they join the admin group", async () => {
		await ldapSync.syncUserGroups(42, ADMIN_GROUPS, LDAP_CONFIG_DB);

		expect(mockUserQuery.patch).toHaveBeenCalledWith(
			expect.objectContaining({ roles: ["admin"] }),
		);
	});

	it("demotes user from admin when they leave the admin group", async () => {
		mockUserQuery.findById.mockResolvedValue(makeNpmUser({ roles: ["admin"] }));

		await ldapSync.syncUserGroups(42, USER_GROUPS, LDAP_CONFIG_DB);

		expect(mockUserQuery.patch).toHaveBeenCalledWith(
			expect.objectContaining({ roles: [] }),
		);
	});

	it("writes an audit log entry when role changes", async () => {
		mockUserQuery.findById.mockResolvedValue(makeNpmUser({ roles: [] }));

		await ldapSync.syncUserGroups(42, ADMIN_GROUPS, LDAP_CONFIG_DB);

		expect(mockAuditQuery.insert).toHaveBeenCalledWith(
			expect.objectContaining({ action: "ldap_user_role_changed" }),
		);
	});

	it("disables user when they are removed from ALL allowed groups", async () => {
		await ldapSync.syncUserGroups(42, NO_GROUPS, LDAP_CONFIG_DB);

		// disableUser calls patch with is_disabled=1
		expect(mockUserQuery.patch).toHaveBeenCalledWith(
			expect.objectContaining({ is_disabled: 1 }),
		);
	});

	it("updates visibility to 'all' for admin users", async () => {
		await ldapSync.syncUserGroups(42, ADMIN_GROUPS, LDAP_CONFIG_DB);

		expect(mockPermQuery.patch).toHaveBeenCalledWith(
			expect.objectContaining({ visibility: "all" }),
		);
	});

	it("updates visibility to 'user' for non-admin users", async () => {
		await ldapSync.syncUserGroups(42, USER_GROUPS, LDAP_CONFIG_DB);

		expect(mockPermQuery.patch).toHaveBeenCalledWith(
			expect.objectContaining({ visibility: "user" }),
		);
	});

	it("creates permissions row if one does not exist", async () => {
		mockPermQuery.first.mockResolvedValue(null); // no existing perms

		await ldapSync.syncUserGroups(42, USER_GROUPS, LDAP_CONFIG_DB);

		expect(mockPermQuery.insert).toHaveBeenCalled();
	});

	it("skips silently when user record is not found", async () => {
		mockUserQuery.findById.mockResolvedValue(null);
		await expect(ldapSync.syncUserGroups(99, USER_GROUPS, LDAP_CONFIG_DB)).resolves.toBeUndefined();
	});

	it("allows access even with no groups when neither admin_group nor user_group is set", async () => {
		const openConfig = { ...LDAP_CONFIG_DB, admin_group: null, user_group: null };

		await expect(ldapSync.syncUserGroups(42, NO_GROUPS, openConfig)).resolves.not.toThrow();

		// User should NOT be disabled
		const calls = mockUserQuery.patch.mock.calls;
		const disableCall = calls.find(([patch]) => patch && patch.is_disabled === 1);
		expect(disableCall).toBeUndefined();
	});
});

// ── syncAllUsers ──────────────────────────────────────────────────────────

describe("ldapSync.syncAllUsers", () => {
	beforeEach(() => {
		// query().where().where().select() for the "disable absent users" step
		mockUserQuery.select.mockResolvedValue([]);
	});

	it("returns early when LDAP is disabled", async () => {
		mockLdapConfigQuery.first.mockResolvedValue({ ...LDAP_CONFIG_DB, enabled: 0 });

		const result = await ldapSync.syncAllUsers();
		expect(result).toMatchObject({ synced: 0, provisioned: 0, disabled: 0, errors: 0 });
		expect(mockInternalLdap.searchAllUsers).not.toHaveBeenCalled();
	});

	it("returns early when no LDAP config exists", async () => {
		mockLdapConfigQuery.first.mockResolvedValue(null);

		const result = await ldapSync.syncAllUsers();
		expect(result).toMatchObject({ synced: 0, provisioned: 0, disabled: 0, errors: 0 });
	});

	it("calls searchAllUsers with the configured page size", async () => {
		await ldapSync.syncAllUsers();

		expect(mockInternalLdap.searchAllUsers).toHaveBeenCalledWith(
			expect.any(Object),     // config
			expect.any(Function),   // pageHandler
			500,                    // default page size (page_size=0 → 500)
		);
	});

	it("uses page_size from config when set", async () => {
		mockLdapConfigQuery.first.mockResolvedValue({ ...LDAP_CONFIG_DB, page_size: 250 });

		await ldapSync.syncAllUsers();

		expect(mockInternalLdap.searchAllUsers).toHaveBeenCalledWith(
			expect.any(Object),
			expect.any(Function),
			250,
		);
	});

	it("processes LDAP entries via the pageHandler callback", async () => {
		mockInternalLdap.normalizeUser.mockReturnValue({
			dn:       ALICE_LDAP_ENTRY.dn,
			username: "alice",
			email:    "alice@example.com",
			displayName: "Alice Smith",
			givenName: "Alice",
			surname:  "Smith",
			memberOf: USER_GROUPS,
		});

		mockInternalLdap.searchAllUsers.mockImplementation(async (_cfg, pageHandler, _size) => {
			await pageHandler([ALICE_LDAP_ENTRY]);
		});

		const result = await ldapSync.syncAllUsers();

		// One user was provisioned (first() returns null = new user)
		expect(result.provisioned).toBe(1);
		expect(result.errors).toBe(0);
	});

	it("increments errors when provisionUser throws for an entry (DB error)", async () => {
		// An entry WITH an email so it's not skipped, but DB insert fails
		mockInternalLdap.normalizeUser.mockReturnValue({
			dn: "uid=baduser", username: "baduser", email: "baduser@example.com",
			displayName: "Bad User", givenName: "Bad", surname: "User",
			memberOf: USER_GROUPS,
		});
		mockInternalLdap.searchAllUsers.mockImplementation(async (_cfg, pageHandler) => {
			await pageHandler([{ dn: "uid=baduser", mail: "baduser@example.com" }]);
		});

		// Make insertAndFetch throw to simulate a DB error during provisioning
		mockUserQuery.insertAndFetch.mockRejectedValue(new Error("DB constraint violation"));

		const result = await ldapSync.syncAllUsers();
		expect(result.errors).toBeGreaterThan(0);
	});

	it("skips LDAP entries with no email address", async () => {
		mockInternalLdap.normalizeUser.mockReturnValue({
			dn: "uid=noemail", username: "noemail", email: "",
			displayName: "", givenName: "", surname: "", memberOf: [],
		});
		mockInternalLdap.searchAllUsers.mockImplementation(async (_cfg, pageHandler) => {
			await pageHandler([{ dn: "uid=noemail", mail: "" }]);
		});

		const result = await ldapSync.syncAllUsers();
		expect(result.provisioned).toBe(0);
		expect(result.synced).toBe(0);

		const skipped = result.details.find((d) => d.status === "skipped");
		expect(skipped).toBeDefined();
	});

	it("returns a details array with one entry per processed LDAP user", async () => {
		mockInternalLdap.normalizeUser.mockReturnValue({
			dn: ALICE_LDAP_ENTRY.dn, username: "alice", email: "alice@example.com",
			displayName: "Alice Smith", givenName: "Alice", surname: "Smith",
			memberOf: USER_GROUPS,
		});
		mockInternalLdap.searchAllUsers.mockImplementation(async (_cfg, pageHandler) => {
			await pageHandler([ALICE_LDAP_ENTRY]);
		});

		const result = await ldapSync.syncAllUsers();
		expect(result.details).toBeInstanceOf(Array);
		expect(result.details.length).toBeGreaterThan(0);
	});

	it("accepts a pageSize override parameter", async () => {
		await ldapSync.syncAllUsers({ pageSize: 100 });

		expect(mockInternalLdap.searchAllUsers).toHaveBeenCalledWith(
			expect.any(Object),
			expect.any(Function),
			100,
		);
	});

	it("processes multiple pages without accumulating all entries (memory bounding)", async () => {
		// Simulate searchAllUsers streaming 3 separate pages
		const pages = [
			[{ dn: "uid=u1", mail: "u1@example.com" }, { dn: "uid=u2", mail: "u2@example.com" }],
			[{ dn: "uid=u3", mail: "u3@example.com" }, { dn: "uid=u4", mail: "u4@example.com" }],
			[{ dn: "uid=u5", mail: "u5@example.com" }, { dn: "uid=u6", mail: "u6@example.com" }],
		];
		const pageHandlerBatchSizes = [];

		mockInternalLdap.searchAllUsers.mockImplementation(async (_cfg, pageHandler, _size) => {
			for (const page of pages) {
				pageHandlerBatchSizes.push(page.length); // record batch size before calling handler
				await pageHandler(page);
			}
		});

		let callCount = 0;
		mockInternalLdap.normalizeUser.mockImplementation((entry) => ({
			dn: entry.dn, username: `u${++callCount}`, email: entry.mail || "",
			displayName: "", givenName: "", surname: "", memberOf: USER_GROUPS,
		}));

		const result = await ldapSync.syncAllUsers();

		// Each page was handled independently (3 pages of 2 entries each)
		expect(pageHandlerBatchSizes).toEqual([2, 2, 2]);
		expect(result.provisioned).toBe(6);
		expect(result.errors).toBe(0);
	});

	it("disables local LDAP users absent from the directory scan", async () => {
		// LDAP scan finds only alice
		mockInternalLdap.normalizeUser.mockReturnValue({
			dn: ALICE_LDAP_ENTRY.dn, username: "alice", email: "alice@example.com",
			displayName: "Alice Smith", givenName: "Alice", surname: "Smith",
			memberOf: USER_GROUPS,
		});
		mockInternalLdap.searchAllUsers.mockImplementation(async (_cfg, pageHandler) => {
			await pageHandler([ALICE_LDAP_ENTRY]);
		});

		// DB has both alice and bob; bob was not seen in the LDAP scan
		mockUserQuery.select.mockResolvedValue([
			{ id: 1, email: "alice@example.com", is_disabled: 0 },
			{ id: 2, email: "bob@example.com",   is_disabled: 0 },
		]);

		const result = await ldapSync.syncAllUsers();

		expect(result.disabled).toBe(1);
		const disabledEntry = result.details.find((d) => d.status === "disabled");
		expect(disabledEntry).toBeDefined();
		expect(disabledEntry.email).toBe("bob@example.com");
	});

	it("does not disable already-disabled local users absent from the scan", async () => {
		mockInternalLdap.searchAllUsers.mockImplementation(async () => {});

		// Both users are already disabled
		mockUserQuery.select.mockResolvedValue([
			{ id: 1, email: "alice@example.com", is_disabled: 1 },
			{ id: 2, email: "bob@example.com",   is_disabled: 1 },
		]);

		const result = await ldapSync.syncAllUsers();
		expect(result.disabled).toBe(0);
	});
});
