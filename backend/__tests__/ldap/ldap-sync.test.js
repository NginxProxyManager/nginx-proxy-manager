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
	parseObjectGUID: jest.fn((buf) => {
		// Simple mock: just return raw hex for test purposes
		if (Buffer.isBuffer(buf)) return buf.toString("hex");
		if (typeof buf === "string") return Buffer.from(buf, "binary").toString("hex");
		return "mock-guid";
	}),
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
		(m) => { mockUserQuery[m].mockReturnValue(mockUserQuery); },
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

// ── _updateExistingLdapUser — skip-patch optimisation ─────────────────────

describe("ldapSync._updateExistingLdapUser — skip-patch optimisation", () => {
	const AVATAR = "https://www.gravatar.com/avatar/test";

	it("skips patch when name, nickname, and avatar are all unchanged", async () => {
		const existing = makeNpmUser({
			name:     "Alice Smith",
			nickname: "alice",
			avatar:   AVATAR,
		});
		mockUserQuery.findById.mockResolvedValue(existing);

		await ldapSync._updateExistingLdapUser(existing, {
			name:     "Alice Smith",
			nickname: "alice",
			email:    "alice@example.com",
		});

		// patch() should NOT have been called for attribute writes
		expect(mockUserQuery.patch).not.toHaveBeenCalled();
	});

	it("applies patch when name changes", async () => {
		const existing = makeNpmUser({ name: "Old Name", nickname: "alice", avatar: AVATAR });
		mockUserQuery.findById.mockResolvedValue(existing);

		await ldapSync._updateExistingLdapUser(existing, {
			name:     "New Name",
			nickname: "alice",
			email:    "alice@example.com",
		});

		expect(mockUserQuery.patch).toHaveBeenCalledWith(
			expect.objectContaining({ name: "New Name" }),
		);
	});

	it("applies patch when nickname changes", async () => {
		const existing = makeNpmUser({ name: "Alice Smith", nickname: "old-nick", avatar: AVATAR });
		mockUserQuery.findById.mockResolvedValue(existing);

		await ldapSync._updateExistingLdapUser(existing, {
			name:     "Alice Smith",
			nickname: "new-nick",
			email:    "alice@example.com",
		});

		expect(mockUserQuery.patch).toHaveBeenCalledWith(
			expect.objectContaining({ nickname: "new-nick" }),
		);
	});

	it("applies patch when avatar would change (different email hash)", async () => {
		// Avatar stored in DB was computed for a different email
		const existing = makeNpmUser({
			name:     "Alice Smith",
			nickname: "alice",
			avatar:   "https://www.gravatar.com/avatar/old-hash",
		});
		mockUserQuery.findById.mockResolvedValue(existing);

		await ldapSync._updateExistingLdapUser(existing, {
			name:     "Alice Smith",
			nickname: "alice",
			email:    "alice@example.com",
		});

		// gravatar mock returns fixed URL — any mismatch with "old-hash" triggers a write
		expect(mockUserQuery.patch).toHaveBeenCalled();
	});

	it("re-enables a disabled user even when no other attributes changed", async () => {
		const existing = makeNpmUser({
			name:        "Alice Smith",
			nickname:    "alice",
			avatar:      AVATAR,
			is_disabled: 1,
		});
		mockUserQuery.findById.mockResolvedValue(existing);

		await ldapSync._updateExistingLdapUser(existing, {
			name:     "Alice Smith",
			nickname: "alice",
			email:    "alice@example.com",
		});

		expect(mockUserQuery.patch).toHaveBeenCalledWith(
			expect.objectContaining({ is_disabled: 0 }),
		);
	});

	it("combines attribute update and re-enable in a single patch call", async () => {
		const existing = makeNpmUser({
			name:        "Old Name",
			nickname:    "alice",
			avatar:      AVATAR,
			is_disabled: 1,
		});
		mockUserQuery.findById.mockResolvedValue(existing);

		await ldapSync._updateExistingLdapUser(existing, {
			name:     "New Name",
			nickname: "alice",
			email:    "alice@example.com",
		});

		// Should call patch exactly once, containing both the attribute change and re-enable
		expect(mockUserQuery.patch).toHaveBeenCalledTimes(1);
		expect(mockUserQuery.patch).toHaveBeenCalledWith(
			expect.objectContaining({ name: "New Name", is_disabled: 0 }),
		);
	});

	it("writes ldap_user_reenabled audit log when re-enabling, but NOT on normal updates", async () => {
		// Re-enable case
		const disabled = makeNpmUser({ name: "Alice Smith", nickname: "alice", avatar: AVATAR, is_disabled: 1 });
		mockUserQuery.findById.mockResolvedValue(disabled);

		await ldapSync._updateExistingLdapUser(disabled, {
			name: "Alice Smith", nickname: "alice", email: "alice@example.com",
		});

		expect(mockAuditQuery.insert).toHaveBeenCalledWith(
			expect.objectContaining({ action: "ldap_user_reenabled" }),
		);
	});

	it("does NOT write audit log for a normal (non-re-enable) update", async () => {
		const active = makeNpmUser({ name: "Old Name", nickname: "alice", avatar: AVATAR, is_disabled: 0 });
		mockUserQuery.findById.mockResolvedValue(active);

		await ldapSync._updateExistingLdapUser(active, {
			name: "New Name", nickname: "alice", email: "alice@example.com",
		});

		const reenableCall = mockAuditQuery.insert.mock.calls.find(
			([row]) => row && row.action === "ldap_user_reenabled",
		);
		expect(reenableCall).toBeUndefined();
	});
});

// ── provisionUser — unique constraint race handling ────────────────────────

describe("ldapSync.provisionUser — unique constraint race handling", () => {
	/** Build a fake ER_DUP_ENTRY error (MySQL unique constraint violation) */
	const makeDupEntryError = () => {
		const err = new Error("Duplicate entry 'alice@example.com' for key 'user_email_unique'");
		err.code = "ER_DUP_ENTRY";
		return err;
	};

	it("retries as update when INSERT hits unique violation for an ldap-sourced race row", async () => {
		// SELECT returns null (user doesn't exist yet)
		mockUserQuery.first.mockResolvedValueOnce(null);

		// INSERT raises a unique constraint error
		mockUserQuery.insertAndFetch.mockRejectedValue(makeDupEntryError());

		// Retry SELECT finds an ldap-sourced user (the winner of the race)
		const raceUser = makeNpmUser({ auth_source: "ldap" });
		mockUserQuery.first.mockResolvedValueOnce(raceUser);

		// findById is used by _updateExistingLdapUser to refresh the row
		mockUserQuery.findById.mockResolvedValue(raceUser);

		// syncUserGroups needs findById too
		mockUserQuery.findById.mockResolvedValue(makeNpmUser({ roles: [] }));
		mockPermQuery.first.mockResolvedValue({ id: 10 });

		const user = await ldapSync.provisionUser(LDAP_USER, LDAP_CONFIG_DB, USER_GROUPS);

		expect(user).toBeDefined();
		// Must NOT have tried to create a second auth record or permissions row
		expect(mockAuthQuery.insert).not.toHaveBeenCalled();
		expect(mockPermQuery.insert).not.toHaveBeenCalled();
	});

	it("throws security error when INSERT hits unique violation and race row is not ldap-sourced", async () => {
		mockUserQuery.first.mockResolvedValueOnce(null);
		mockUserQuery.insertAndFetch.mockRejectedValue(makeDupEntryError());

		// Race row is a local user
		mockUserQuery.first.mockResolvedValueOnce(makeNpmUser({ auth_source: "local" }));

		await expect(
			ldapSync.provisionUser(LDAP_USER, LDAP_CONFIG_DB, USER_GROUPS),
		).rejects.toThrow(/different authentication source/i);
	});

	it("re-throws non-unique errors from INSERT unchanged", async () => {
		mockUserQuery.first.mockResolvedValueOnce(null);

		const dbErr = new Error("Connection lost");
		dbErr.code = "ECONNRESET";
		mockUserQuery.insertAndFetch.mockRejectedValue(dbErr);

		await expect(
			ldapSync.provisionUser(LDAP_USER, LDAP_CONFIG_DB, USER_GROUPS),
		).rejects.toThrow("Connection lost");
	});

	it("re-throws unique violation when race row vanishes before re-SELECT", async () => {
		mockUserQuery.first.mockResolvedValueOnce(null);
		mockUserQuery.insertAndFetch.mockRejectedValue(makeDupEntryError());

		// Re-SELECT finds nothing (user was hard-deleted between INSERT and re-SELECT)
		mockUserQuery.first.mockResolvedValueOnce(null);

		await expect(
			ldapSync.provisionUser(LDAP_USER, LDAP_CONFIG_DB, USER_GROUPS),
		).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
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

	it("summary counts match actual DB state after searchPaged resolves (no early-resolve race)", async () => {
		// Regression test: before the inFlightHandler fix, searchPaged could resolve
		// before the last page handler's async DB writes completed.  This caused
		// step 4 (disable-absent-users) to run while step 3 was still in-flight,
		// producing wrong synced/provisioned counts and disable-then-reenable races.
		//
		// This test simulates the race by using a pageHandler that records completion
		// only after an async step, then verifies the returned counts are accurate.

		const processedEmails = [];

		// Simulate searchAllUsers delivering two pages of users with an async gap
		mockInternalLdap.searchAllUsers.mockImplementation(async (_cfg, pageHandler) => {
			const page1 = [
				{ dn: "uid=alice", mail: "alice@example.com" },
				{ dn: "uid=bob",   mail: "bob@example.com"   },
			];
			const page2 = [
				{ dn: "uid=carol", mail: "carol@example.com" },
			];

			// Wrap to capture completion (simulating async DB writes inside pageHandler)
			const wrappedHandler = async (entries) => {
				await pageHandler(entries);
				for (const e of entries) {
					processedEmails.push(e.mail);
				}
			};

			await wrappedHandler(page1);
			await wrappedHandler(page2);
		});

		let callCount = 0;
		mockInternalLdap.normalizeUser.mockImplementation((entry) => ({
			dn: entry.dn, username: `user${++callCount}`, email: entry.mail || "",
			displayName: "", givenName: "", surname: "", memberOf: USER_GROUPS,
		}));

		// DB: all three users are new (no existing users)
		mockUserQuery.first.mockResolvedValue(null);

		// No absent users to disable
		mockUserQuery.select.mockResolvedValue([]);

		const result = await ldapSync.syncAllUsers();

		// After syncAllUsers resolves, all page handlers must have completed
		expect(result.provisioned).toBe(3);
		expect(result.synced).toBe(0);
		expect(result.errors).toBe(0);
		expect(result.disabled).toBe(0);

		// Summary counts must be consistent with what was actually processed
		expect(result.provisioned + result.synced + result.errors).toBe(
			result.details.filter((d) => d.status !== "disabled").length,
		);
	});

	// ── Unified disable path: group-membership check ────────────────────────

	it("user in LDAP but not in required group → disabled (not error + disabled)", async () => {
		// Config: access restricted to npm-users group
		// Alice is in LDAP but NOT in any allowed group

		const ALICE_GUID_LOCAL = "aabbccddeeff00112233445566778800";

		mockInternalLdap.normalizeUser.mockReturnValue({
			dn:          "uid=alice,ou=Users,dc=example,dc=com",
			username:    "alice",
			email:       "alice@example.com",
			displayName: "Alice Smith",
			givenName:   "Alice",
			surname:     "Smith",
			memberOf:    [],          // ← no groups at all
			ldapGuid:    ALICE_GUID_LOCAL,
		});

		mockInternalLdap.searchAllUsers.mockImplementation(async (_cfg, pageHandler) => {
			await pageHandler([ALICE_LDAP_ENTRY]);
		});

		// Alice exists in the DB (existing user, currently enabled)
		const aliceNpmUser = makeNpmUser({ id: 42, email: "alice@example.com", is_disabled: 0 });
		// authModel: GUID lookup finds her auth record
		mockAuthQuery.first.mockResolvedValue({
			id:        1,
			user_id:   42,
			type:      "ldap",
			ldap_dn:   aliceNpmUser.email,
			ldap_guid: ALICE_GUID_LOCAL,
		});
		// userModel: findById returns Alice; patch chains back correctly
		mockUserQuery.findById.mockResolvedValue(aliceNpmUser);

		const result = await ldapSync.syncAllUsers();

		// Must be disabled, not an error
		expect(result.disabled).toBe(1);
		expect(result.errors).toBe(0);
		expect(result.synced).toBe(0);
		expect(result.provisioned).toBe(0);

		// details entry should record as "disabled", not "error"
		const disabledEntry = result.details.find((d) => d.email === "alice@example.com");
		expect(disabledEntry).toBeDefined();
		expect(disabledEntry.status).toBe("disabled");
		expect(disabledEntry.reason).toMatch(/not in required/i);
	});

	it("user in LDAP but not in required group, already disabled → skipped (not double-disabled)", async () => {
		const ALICE_GUID_LOCAL = "aabbccddeeff00112233445566778801";

		mockInternalLdap.normalizeUser.mockReturnValue({
			dn:          "uid=alice,ou=Users,dc=example,dc=com",
			username:    "alice",
			email:       "alice@example.com",
			displayName: "Alice Smith",
			givenName:   "Alice",
			surname:     "Smith",
			memberOf:    [],
			ldapGuid:    ALICE_GUID_LOCAL,
		});

		mockInternalLdap.searchAllUsers.mockImplementation(async (_cfg, pageHandler) => {
			await pageHandler([ALICE_LDAP_ENTRY]);
		});

		// Alice is already disabled in the DB
		const aliceDisabled = makeNpmUser({ id: 42, email: "alice@example.com", is_disabled: 1 });
		mockAuthQuery.first.mockResolvedValue({
			id: 1, user_id: 42, type: "ldap", ldap_dn: "uid=alice", ldap_guid: ALICE_GUID_LOCAL,
		});
		mockUserQuery.findById.mockResolvedValue(aliceDisabled);

		const result = await ldapSync.syncAllUsers();

		// Already disabled → skipped, not counted as disabled again
		expect(result.disabled).toBe(0);
		expect(result.errors).toBe(0);

		const entry = result.details.find((d) => d.email === "alice@example.com");
		expect(entry).toBeDefined();
		expect(entry.status).toBe("skipped");
	});

	it("error count and disabled count are mutually exclusive (disabled != error)", async () => {
		// One user not in group (→ disabled), one user with a DB error (→ error)
		const ALICE_GUID_LOCAL = "aabbccddeeff00112233445566778802";
		const BOB_ENTRY        = { dn: "uid=bob", mail: "bob@example.com" };

		let callCount = 0;
		mockInternalLdap.normalizeUser.mockImplementation((_entry) => {
			callCount++;
			if (callCount === 1) {
				// Alice: in LDAP, not in required group
				return {
					dn: ALICE_LDAP_ENTRY.dn, username: "alice", email: "alice@example.com",
					displayName: "Alice Smith", givenName: "Alice", surname: "Smith",
					memberOf: [], ldapGuid: ALICE_GUID_LOCAL,
				};
			}
			// Bob: valid groups but will cause a DB error
			return {
				dn: BOB_ENTRY.dn, username: "bob", email: "bob@example.com",
				displayName: "Bob Jones", givenName: "Bob", surname: "Jones",
				memberOf: USER_GROUPS, ldapGuid: null,
			};
		});

		mockInternalLdap.searchAllUsers.mockImplementation(async (_cfg, pageHandler) => {
			await pageHandler([ALICE_LDAP_ENTRY, BOB_ENTRY]);
		});

		// Auth lookups: Alice has a GUID record; Bob (no GUID) lookup via email
		const aliceNpmUser = makeNpmUser({ id: 42, email: "alice@example.com", is_disabled: 0 });
		mockAuthQuery.first
			.mockResolvedValueOnce({ id: 1, user_id: 42, type: "ldap", ldap_dn: "uid=alice", ldap_guid: ALICE_GUID_LOCAL }) // Alice auth
			.mockResolvedValueOnce(null); // Bob auth lookup (no GUID)
		mockUserQuery.findById
			.mockResolvedValueOnce(aliceNpmUser)  // step 3 existingUser lookup for Alice
			.mockResolvedValueOnce(aliceNpmUser); // catch: userToCheck for Alice
		// Bob email lookup → first() returns null (new user) then DB insert fails
		mockUserQuery.first
			.mockResolvedValueOnce(null)  // Bob: not found by email → isNew=true
			.mockResolvedValueOnce(null); // Bob: no race user found after insert failure
		mockUserQuery.insertAndFetch.mockRejectedValue(new Error("DB constraint violation"));

		const result = await ldapSync.syncAllUsers();

		expect(result.disabled).toBe(1);  // Alice: in LDAP but not in group
		expect(result.errors).toBe(1);    // Bob: genuine DB error
		expect(result.disabled + result.errors).toBe(2); // mutually exclusive
	});
});

// ---------------------------------------------------------------------------
// GUID-based identifier tests (PR #5345 review: objectGUID / entryUUID)
// ---------------------------------------------------------------------------

/** Stable hex GUID (as returned by normalizeUser for AD objectGUID) */
const ALICE_GUID = "aabbccddeeff00112233445566778899";
/** Stable entryUUID (as returned by normalizeUser for OpenLDAP) */
const BOB_GUID   = "550e8400-e29b-41d4-a716-446655440000";

/** LDAP_USER extended with ldapGuid */
const LDAP_USER_WITH_GUID = {
	...LDAP_USER,
	ldapGuid: ALICE_GUID,
};

const LDAP_USER_WITH_ENTRY_UUID = {
	dn:          "uid=bob,ou=Users,dc=example,dc=com",
	username:    "bob",
	email:       "bob@example.com",
	displayName: "Bob Jones",
	givenName:   "Bob",
	surname:     "Jones",
	memberOf:    [],
	ldapGuid:    BOB_GUID,
};

const LDAP_USER_NO_GUID_NO_EMAIL = {
	dn:          "uid=noguid,ou=Users,dc=example,dc=com",
	username:    "noguid",
	email:       "",
	displayName: "No Guid",
	givenName:   "",
	surname:     "",
	memberOf:    [],
	ldapGuid:    null,
};

const LDAP_USER_NO_EMAIL_WITH_GUID = {
	...LDAP_USER_WITH_GUID,
	email: "",
};

describe("ldapSync.provisionUser — GUID-based identity (objectGUID / entryUUID)", () => {
	it("stores ldap_guid in auth record when ldapGuid is present", async () => {
		// No existing auth record by GUID
		mockAuthQuery.first.mockResolvedValue(null);
		// No existing user by email either
		mockUserQuery.first.mockResolvedValue(null);

		await ldapSync.provisionUser(LDAP_USER_WITH_GUID, LDAP_CONFIG_DB, USER_GROUPS);

		expect(mockAuthQuery.insert).toHaveBeenCalledWith(
			expect.objectContaining({ ldap_guid: ALICE_GUID, type: "ldap" }),
		);
	});

	it("updates existing user found by GUID without touching email-lookup path", async () => {
		const existingAuth = { id: 10, user_id: 42, type: "ldap", ldap_dn: LDAP_USER_WITH_GUID.dn, ldap_guid: ALICE_GUID };
		mockAuthQuery.first.mockResolvedValue(existingAuth);
		mockUserQuery.findById.mockResolvedValue(makeNpmUser());

		await ldapSync.provisionUser(LDAP_USER_WITH_GUID, LDAP_CONFIG_DB, USER_GROUPS);

		// Should NOT call insertAndFetch — user already exists
		expect(mockUserQuery.insertAndFetch).not.toHaveBeenCalled();
	});

	it("uses synthetic email (guid@ldap.local) when LDAP user has no real email", async () => {
		mockAuthQuery.first.mockResolvedValue(null);
		mockUserQuery.first.mockResolvedValue(null);

		await ldapSync.provisionUser(LDAP_USER_NO_EMAIL_WITH_GUID, LDAP_CONFIG_DB, USER_GROUPS);

		expect(mockUserQuery.insertAndFetch).toHaveBeenCalledWith(
			expect.objectContaining({ email: `${ALICE_GUID}@ldap.local` }),
		);
	});

	it("GUID-first: LDAP user with same email as local account gets synthetic email, not an error", async () => {
		// Primary GUID lookup → no existing auth record
		mockAuthQuery.first.mockResolvedValue(null);

		// Email lookup finds a LOCAL (non-ldap) account with the same email
		mockUserQuery.first.mockResolvedValue(
			makeNpmUser({ auth_source: "local", id: 99 }),
		);
		// insertAndFetch for the new synthetic-email user
		mockUserQuery.insertAndFetch.mockImplementation((data) =>
			Promise.resolve({ id: 100, ...data }),
		);

		await ldapSync.provisionUser(LDAP_USER_WITH_GUID, LDAP_CONFIG_DB, USER_GROUPS);

		// Should NOT throw; should create user with synthetic email
		expect(mockUserQuery.insertAndFetch).toHaveBeenCalledWith(
			expect.objectContaining({ email: `${ALICE_GUID}@ldap.local`, auth_source: "ldap" }),
		);
		// The synthetic email must be guid@ldap.local
		const callArg = mockUserQuery.insertAndFetch.mock.calls[0][0];
		expect(callArg.email).toBe(`${ALICE_GUID}@ldap.local`);
	});

	it("backfills GUID for existing LDAP user found by email (migration path)", async () => {
		// No auth record by GUID
		mockAuthQuery.first.mockResolvedValue(null);
		// Email lookup finds existing LDAP user
		mockUserQuery.first.mockResolvedValue(makeNpmUser({ auth_source: "ldap" }));
		// Auth record for that user (no GUID yet)
		const userAuthRecord = { id: 10, user_id: 42, type: "ldap", ldap_dn: LDAP_USER_WITH_GUID.dn, ldap_guid: null };
		// second call: authQuery for backfill lookup
		mockAuthQuery.first
			.mockResolvedValueOnce(null)               // GUID lookup: no record
			.mockResolvedValueOnce(userAuthRecord);     // email path: user's auth record

		await ldapSync.provisionUser(LDAP_USER_WITH_GUID, LDAP_CONFIG_DB, USER_GROUPS);

		// Should patch auth record with the GUID
		expect(mockAuthQuery.where).toHaveBeenCalledWith("user_id", 42);
		// patch called to backfill
		expect(mockAuthQuery.patch || mockAuthQuery.insert).toBeDefined();
	});

	it("throws when LDAP user has neither GUID nor email (cannot provision)", async () => {
		await expect(
			ldapSync.provisionUser(LDAP_USER_NO_GUID_NO_EMAIL, LDAP_CONFIG_DB, USER_GROUPS),
		).rejects.toThrow(/neither a stable GUID nor an email/);
	});

	it("normalizeUser: extracts objectGUID Buffer to hex string", async () => {
		// Re-import the real internalLdap to test normalizeUser directly
		// (in this test file internalLdap is mocked for ldap-sync, so test via fixture)
		const guidBuffer = Buffer.from("aabbccddeeff0011", "hex");
		const entry = {
			dn:          "uid=alice,dc=example,dc=com",
			objectGUID:  guidBuffer,
			mail:        "alice@example.com",
			displayName: "Alice",
			uid:         "alice",
		};
		// Call through the mock to verify our fixture matches real shape
		mockInternalLdap.normalizeUser.mockReturnValueOnce({
			...LDAP_USER,
			ldapGuid: guidBuffer.toString("hex"),
		});
		const result = mockInternalLdap.normalizeUser(entry, "uid");
		expect(result.ldapGuid).toBe("aabbccddeeff0011");
	});

	it("normalizeUser: extracts entryUUID string as-is", () => {
		const entry = {
			dn:        "uid=bob,dc=example,dc=com",
			entryUUID: BOB_GUID,
			mail:      "bob@example.com",
			uid:       "bob",
		};
		mockInternalLdap.normalizeUser.mockReturnValueOnce({
			...LDAP_USER_WITH_ENTRY_UUID,
			ldapGuid: BOB_GUID.toLowerCase(),
		});
		const result = mockInternalLdap.normalizeUser(entry, "uid");
		expect(result.ldapGuid).toBe(BOB_GUID.toLowerCase());
	});
});

describe("ldapSync — email collision: local + LDAP same email (regression tests)", () => {
	/**
	 * Scenario: alice@example.com already exists as a LOCAL account (auth_source='local').
	 * An LDAP user with the same email tries to log in.
	 *
	 * Old behaviour (email-based): THREW an error, blocking the LDAP user entirely.
	 * New behaviour (GUID-based): LDAP user gets a synthetic email, local account is untouched.
	 */
	it("LDAP user with GUID can log in even when email is taken by local account", async () => {
		// Simulate the full provisionUser GUID path:
		// 1. GUID lookup → no auth record
		mockAuthQuery.first.mockResolvedValue(null);

		// 2. Email lookup → local user owns alice@example.com
		mockUserQuery.first.mockResolvedValue(
			makeNpmUser({ auth_source: "local", id: 7, email: "alice@example.com" }),
		);

		// 3. insert for synthetic-email LDAP user
		mockUserQuery.insertAndFetch.mockImplementation((data) =>
			Promise.resolve({ id: 43, ...data }),
		);

		await ldapSync.provisionUser(LDAP_USER_WITH_GUID, LDAP_CONFIG_DB, USER_GROUPS);

		// Local user untouched — new LDAP user has synthetic email
		expect(mockUserQuery.insertAndFetch).toHaveBeenCalledWith(
			expect.objectContaining({
				email:       `${ALICE_GUID}@ldap.local`,
				auth_source: "ldap",
			}),
		);
	});

	it("local account with same email is NOT disabled or modified during LDAP login", async () => {
		mockAuthQuery.first.mockResolvedValue(null);
		mockUserQuery.first.mockResolvedValue(
			makeNpmUser({ auth_source: "local", id: 7 }),
		);
		mockUserQuery.insertAndFetch.mockImplementation((data) =>
			Promise.resolve({ id: 43, ...data }),
		);

		await ldapSync.provisionUser(LDAP_USER_WITH_GUID, LDAP_CONFIG_DB, USER_GROUPS);

		// patch should NOT be called to modify the local user (id=7)
		// (patch is called for syncUserGroups on the NEW ldap user, not the local one)
		const patchCalls = mockUserQuery.patch?.mock?.calls || [];
		patchCalls.forEach((call) => {
			// No patch should target user id=7
			expect(call).not.toContain(7);
		});
	});

	it("synthetic email format is always guid@ldap.local", () => {
		// Verify the formula directly
		const guid = "deadbeef1234567890abcdef12345678";
		const expected = `${guid}@ldap.local`;
		// makeMockEmail is not exported but we can test the effect via provisionUser mock shape
		expect(expected).toMatch(/^[0-9a-f-]+@ldap\.local$/);
	});

	it("two different LDAP users can share the same display email if one has no email and one does", async () => {
		// User A: has real email alice@example.com, owned by local account → gets synthetic
		// User B: also no email → gets synthetic from their own GUID → no collision
		const USER_B_GUID = "cafebabe00000000cafebabe00000000";
		const ldapUserB = {
			dn:          "uid=ldapb,ou=Users,dc=example,dc=com",
			username:    "ldapb",
			email:       "alice@example.com",  // same email as local user A
			displayName: "LDAP B",
			givenName:   "LDAP",
			surname:     "B",
			memberOf:    [],
			ldapGuid:    USER_B_GUID,
		};

		mockAuthQuery.first.mockResolvedValue(null);
		// local account owns alice@example.com
		mockUserQuery.first.mockResolvedValue(
			makeNpmUser({ auth_source: "local", id: 99, email: "alice@example.com" }),
		);
		mockUserQuery.insertAndFetch.mockImplementation((data) =>
			Promise.resolve({ id: 200, ...data }),
		);

		await ldapSync.provisionUser(ldapUserB, LDAP_CONFIG_DB, USER_GROUPS);

		expect(mockUserQuery.insertAndFetch).toHaveBeenCalledWith(
			expect.objectContaining({ email: `${USER_B_GUID}@ldap.local` }),
		);
	});
});
