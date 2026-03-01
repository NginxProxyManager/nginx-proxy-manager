/**
 * Unit tests for AD objectGUID binary parsing and LDAP filter encoding.
 *
 * Tests parseObjectGUID() and guidToLdapFilter() from backend/internal/ldap.js
 * with known AD binary-to-GUID test vectors.
 *
 * Run with Jest + ESM support:
 *   NODE_OPTIONS="--experimental-vm-modules" npx jest --no-coverage backend/__tests__/ldap/objectguid.test.js
 */

import { jest } from "@jest/globals";

// ---------------------------------------------------------------------------
// Module mocks — must be called BEFORE the dynamic import below
// ---------------------------------------------------------------------------

jest.unstable_mockModule("../../lib/ldap-client.js", () => ({
	default: {
		create:         jest.fn(),
		mapLdapError:   (err) => err?.message || "LDAP error",
		borrowFromPool: jest.fn(),
		returnToPool:   jest.fn(),
	},
	mapLdapError:   jest.fn(),
	borrowFromPool: jest.fn(),
	returnToPool:   jest.fn(),
}));

jest.unstable_mockModule("../../logger.js", () => ({
	ldap:   { debug: jest.fn(), warn: jest.fn(), info: jest.fn(), error: jest.fn() },
	global: { debug: jest.fn(), warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

jest.unstable_mockModule("../../lib/error.js", () => ({
	default: {
		AuthError: class AuthError extends Error {
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

let parseObjectGUID;
let guidToLdapFilter;
let internalLdap;
beforeAll(async () => {
	({ parseObjectGUID, guidToLdapFilter, default: internalLdap } = await import("../../internal/ldap.js"));
});

// ---------------------------------------------------------------------------
// Test vectors
// ---------------------------------------------------------------------------

/**
 * Known AD objectGUID binary-to-GUID pairs.
 *
 * AD stores objectGUID in mixed-endian format:
 *   Data1 (4 bytes): little-endian
 *   Data2 (2 bytes): little-endian
 *   Data3 (2 bytes): little-endian
 *   Data4 (8 bytes): big-endian
 */
const TEST_VECTORS = [
	{
		name: "Task specification test vector",
		binary: [0xA1, 0xB2, 0xC3, 0xD4, 0xE5, 0xF6, 0xA7, 0xB8, 0xC9, 0xD0, 0xE1, 0xF2, 0xA3, 0xB4, 0xC5, 0xD6],
		guid: "d4c3b2a1-f6e5-b8a7-c9d0-e1f2a3b4c5d6",
	},
	{
		name: "All zeros",
		binary: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
		guid: "00000000-0000-0000-0000-000000000000",
	},
	{
		name: "All FF",
		binary: [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF],
		guid: "ffffffff-ffff-ffff-ffff-ffffffffffff",
	},
	{
		name: "Sequential bytes (demonstrates endian swap)",
		binary: [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10],
		guid: "04030201-0605-0807-090a-0b0c0d0e0f10",
	},
	{
		name: "Real-world AD GUID (Administrator-like)",
		binary: [0x6D, 0x3B, 0xF5, 0x9A, 0x12, 0x4E, 0x7C, 0x41, 0x8B, 0xD2, 0xE0, 0xC5, 0x42, 0x3A, 0xF1, 0x08],
		guid: "9af53b6d-4e12-417c-8bd2-e0c5423af108",
	},
];

// ---------------------------------------------------------------------------
// parseObjectGUID tests
// ---------------------------------------------------------------------------

describe("parseObjectGUID", () => {
	test.each(TEST_VECTORS)("$name — Buffer input", ({ binary, guid }) => {
		const buf = Buffer.from(binary);
		expect(parseObjectGUID(buf)).toBe(guid);
	});

	test.each(TEST_VECTORS)("$name — binary string input", ({ binary, guid }) => {
		// Simulate ldapjs returning objectGUID as a binary-encoded string
		const binaryStr = String.fromCharCode(...binary);
		expect(parseObjectGUID(binaryStr)).toBe(guid);
	});

	it("throws on buffer shorter than 16 bytes", () => {
		expect(() => parseObjectGUID(Buffer.from([0x01, 0x02]))).toThrow("exactly 16 bytes");
	});

	it("throws on buffer longer than 16 bytes", () => {
		const buf = Buffer.alloc(20, 0xAA);
		expect(() => parseObjectGUID(buf)).toThrow("exactly 16 bytes");
	});

	it("throws on empty buffer", () => {
		expect(() => parseObjectGUID(Buffer.alloc(0))).toThrow("exactly 16 bytes");
	});

	it("throws on non-buffer/non-string input", () => {
		expect(() => parseObjectGUID(12345)).toThrow();
	});

	it("produces lowercase output", () => {
		const buf = Buffer.from([0xAB, 0xCD, 0xEF, 0x01, 0x23, 0x45, 0x67, 0x89,
		                         0xAB, 0xCD, 0xEF, 0x01, 0x23, 0x45, 0x67, 0x89]);
		const result = parseObjectGUID(buf);
		expect(result).toBe(result.toLowerCase());
	});

	it("output matches standard UUID format (8-4-4-4-12)", () => {
		const buf = Buffer.from(TEST_VECTORS[0].binary);
		const result = parseObjectGUID(buf);
		expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
	});
});

// ---------------------------------------------------------------------------
// guidToLdapFilter tests
// ---------------------------------------------------------------------------

describe("guidToLdapFilter", () => {
	it("converts task spec GUID back to correct binary filter", () => {
		const filter = guidToLdapFilter("d4c3b2a1-f6e5-b8a7-c9d0-e1f2a3b4c5d6");
		// The binary bytes should be the original mixed-endian order
		expect(filter).toBe("\\a1\\b2\\c3\\d4\\e5\\f6\\a7\\b8\\c9\\d0\\e1\\f2\\a3\\b4\\c5\\d6");
	});

	it("round-trips: parseObjectGUID -> guidToLdapFilter -> back to original bytes", () => {
		const original = Buffer.from([0xA1, 0xB2, 0xC3, 0xD4, 0xE5, 0xF6, 0xA7, 0xB8,
		                              0xC9, 0xD0, 0xE1, 0xF2, 0xA3, 0xB4, 0xC5, 0xD6]);
		const guid = parseObjectGUID(original);
		const filter = guidToLdapFilter(guid);

		// Extract hex bytes from filter string
		const hexBytes = filter.match(/\\([0-9a-f]{2})/g).map((s) => parseInt(s.slice(1), 16));
		const roundTripped = Buffer.from(hexBytes);

		expect(roundTripped).toEqual(original);
	});

	it("produces 16 escaped byte pairs", () => {
		const filter = guidToLdapFilter("d4c3b2a1-f6e5-b8a7-c9d0-e1f2a3b4c5d6");
		const parts = filter.split("\\").filter(Boolean);
		expect(parts).toHaveLength(16);
	});

	it("handles all-zeros GUID", () => {
		const filter = guidToLdapFilter("00000000-0000-0000-0000-000000000000");
		expect(filter).toBe("\\00\\00\\00\\00\\00\\00\\00\\00\\00\\00\\00\\00\\00\\00\\00\\00");
	});

	it("throws on invalid GUID format (wrong length)", () => {
		expect(() => guidToLdapFilter("abc")).toThrow("Invalid GUID format");
	});

	it("throws on GUID with wrong number of hex chars", () => {
		expect(() => guidToLdapFilter("d4c3b2a1-f6e5-b8a7-c9d0-e1f2a3b4c5")).toThrow("Invalid GUID format");
	});
});

// ---------------------------------------------------------------------------
// normalizeUser objectGUID integration
// ---------------------------------------------------------------------------

describe("normalizeUser — objectGUID handling", () => {
	it("parses objectGUID Buffer to standard hyphenated GUID", () => {
		const guidBuffer = Buffer.from([0xA1, 0xB2, 0xC3, 0xD4, 0xE5, 0xF6, 0xA7, 0xB8,
		                                0xC9, 0xD0, 0xE1, 0xF2, 0xA3, 0xB4, 0xC5, 0xD6]);
		const entry = {
			dn:          "cn=testuser,dc=example,dc=com",
			uid:         "testuser",
			mail:        "test@example.com",
			objectGUID:  guidBuffer,
		};

		const result = internalLdap.normalizeUser(entry, "uid");
		expect(result.ldapGuid).toBe("d4c3b2a1-f6e5-b8a7-c9d0-e1f2a3b4c5d6");
	});

	it("parses objectGUID binary string to standard hyphenated GUID", () => {
		// Simulate ldapjs returning objectGUID as a binary string
		const binaryStr = String.fromCharCode(0xA1, 0xB2, 0xC3, 0xD4, 0xE5, 0xF6, 0xA7, 0xB8,
		                                      0xC9, 0xD0, 0xE1, 0xF2, 0xA3, 0xB4, 0xC5, 0xD6);
		const entry = {
			dn:          "cn=testuser,dc=example,dc=com",
			uid:         "testuser",
			mail:        "test@example.com",
			objectGUID:  binaryStr,
		};

		const result = internalLdap.normalizeUser(entry, "uid");
		expect(result.ldapGuid).toBe("d4c3b2a1-f6e5-b8a7-c9d0-e1f2a3b4c5d6");
	});

	it("preserves entryUUID as-is (OpenLDAP, already a proper UUID string)", () => {
		const entry = {
			dn:          "uid=alice,ou=Users,dc=example,dc=com",
			uid:         "alice",
			mail:        "alice@example.com",
			entryUUID:   "550E8400-E29B-41D4-A716-446655440000",
		};

		const result = internalLdap.normalizeUser(entry, "uid");
		expect(result.ldapGuid).toBe("550e8400-e29b-41d4-a716-446655440000");
	});

	it("returns null ldapGuid when neither objectGUID nor entryUUID present", () => {
		const entry = {
			dn:  "uid=bob,ou=Users,dc=example,dc=com",
			uid: "bob",
		};

		const result = internalLdap.normalizeUser(entry, "uid");
		expect(result.ldapGuid).toBeNull();
	});

	it("falls back to raw hex if objectGUID is not exactly 16 bytes", () => {
		// Edge case: malformed objectGUID (not 16 bytes)
		const shortBuf = Buffer.from([0x01, 0x02, 0x03]);
		const entry = {
			dn:          "cn=weird,dc=example,dc=com",
			uid:         "weird",
			objectGUID:  shortBuf,
		};

		const result = internalLdap.normalizeUser(entry, "uid");
		// Should fall back to raw hex since parseObjectGUID will throw
		expect(result.ldapGuid).toBe("010203");
	});
});

// ---------------------------------------------------------------------------
// Integration test: full sync cycle — provision with GUID then re-sync finds user
// ---------------------------------------------------------------------------

describe("Integration: GUID consistency across sync cycles", () => {
	it("same objectGUID binary always produces identical GUID string (idempotent)", () => {
		// Simulate two separate LDAP syncs returning the same objectGUID bytes
		const adBinary = Buffer.from([0xA1, 0xB2, 0xC3, 0xD4, 0xE5, 0xF6, 0xA7, 0xB8,
		                              0xC9, 0xD0, 0xE1, 0xF2, 0xA3, 0xB4, 0xC5, 0xD6]);

		// First sync: normalizeUser extracts GUID
		const entry1 = {
			dn: "cn=jdoe,ou=Users,dc=corp,dc=com",
			sAMAccountName: "jdoe",
			mail: "jdoe@corp.com",
			objectGUID: Buffer.from(adBinary), // fresh Buffer copy
		};
		const user1 = internalLdap.normalizeUser(entry1, "sAMAccountName");

		// Second sync: same user, fresh LDAP response (new Buffer instance)
		const entry2 = {
			dn: "cn=jdoe,ou=Users,dc=corp,dc=com",
			sAMAccountName: "jdoe",
			mail: "jdoe@corp.com",
			objectGUID: Buffer.from(adBinary), // different Buffer, same bytes
		};
		const user2 = internalLdap.normalizeUser(entry2, "sAMAccountName");

		// The GUID must be identical across syncs — this is the core invariant
		// that was broken before the fix (raw hex != canonical GUID)
		expect(user1.ldapGuid).toBe(user2.ldapGuid);
		expect(user1.ldapGuid).toBe("d4c3b2a1-f6e5-b8a7-c9d0-e1f2a3b4c5d6");
	});

	it("GUID from normalizeUser can be used in guidToLdapFilter for AD search", () => {
		// Simulate: user provisioned → stored GUID → later search by GUID
		const adBinary = Buffer.from([0x6D, 0x3B, 0xF5, 0x9A, 0x12, 0x4E, 0x7C, 0x41,
		                              0x8B, 0xD2, 0xE0, 0xC5, 0x42, 0x3A, 0xF1, 0x08]);

		// Step 1: normalizeUser extracts the GUID during provisioning
		const entry = {
			dn: "cn=admin,ou=Users,dc=corp,dc=com",
			uid: "admin",
			objectGUID: adBinary,
		};
		const normalized = internalLdap.normalizeUser(entry, "uid");
		const storedGuid = normalized.ldapGuid;
		expect(storedGuid).toBe("9af53b6d-4e12-417c-8bd2-e0c5423af108");

		// Step 2: later, build LDAP search filter from stored GUID
		const filter = guidToLdapFilter(storedGuid);

		// Step 3: the filter bytes should reconstruct the original binary
		const filterBytes = filter.match(/\\([0-9a-f]{2})/g).map((s) => parseInt(s.slice(1), 16));
		expect(Buffer.from(filterBytes)).toEqual(adBinary);
	});

	it("binary string input (ldapjs compat) produces same GUID as Buffer input", () => {
		const bytes = [0x01, 0x23, 0x45, 0x67, 0x89, 0xAB, 0xCD, 0xEF,
		               0xFE, 0xDC, 0xBA, 0x98, 0x76, 0x54, 0x32, 0x10];

		// ldapjs may return objectGUID as either Buffer or binary string
		const entryBuf = {
			dn: "cn=test", uid: "test",
			objectGUID: Buffer.from(bytes),
		};
		const entryStr = {
			dn: "cn=test", uid: "test",
			objectGUID: String.fromCharCode(...bytes),
		};

		const guidFromBuf = internalLdap.normalizeUser(entryBuf, "uid").ldapGuid;
		const guidFromStr = internalLdap.normalizeUser(entryStr, "uid").ldapGuid;

		// Both must produce identical GUID — critical for seenGuids matching
		expect(guidFromBuf).toBe(guidFromStr);
		expect(guidFromBuf).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
	});

	it("synthetic email uses the corrected GUID format (not raw hex)", () => {
		const adBinary = Buffer.from([0xA1, 0xB2, 0xC3, 0xD4, 0xE5, 0xF6, 0xA7, 0xB8,
		                              0xC9, 0xD0, 0xE1, 0xF2, 0xA3, 0xB4, 0xC5, 0xD6]);

		const entry = {
			dn: "cn=nomail,ou=Users,dc=corp,dc=com",
			uid: "nomail",
			// no mail attribute
			objectGUID: adBinary,
		};
		const user = internalLdap.normalizeUser(entry, "uid");

		// The GUID used in synthetic email should be the corrected format
		const expectedGuid = "d4c3b2a1-f6e5-b8a7-c9d0-e1f2a3b4c5d6";
		expect(user.ldapGuid).toBe(expectedGuid);

		// Synthetic email would be: {guid}@ldap.local
		// Old bug: would have been a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6@ldap.local (wrong!)
		const syntheticEmail = `${user.ldapGuid}@ldap.local`;
		expect(syntheticEmail).toBe(`${expectedGuid}@ldap.local`);
		expect(syntheticEmail).not.toContain("a1b2c3d4e5f6a7b8"); // old raw hex pattern
	});
});
