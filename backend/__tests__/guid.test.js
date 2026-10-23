import { describe, expect, it } from "vitest";
import { extractDirectoryGuid, guidToLdapFilter, normalizeEntryUuid, parseObjectGuid } from "../lib/auth/guid.js";

// The first three groups of an objectGUID are little-endian and the last two
// big-endian, so a straight hex dump of the bytes is the wrong answer. These
// vectors pin the byte order down.
const VECTORS = [
	{
		bytes: [0xa1, 0xb2, 0xc3, 0xd4, 0xe5, 0xf6, 0xa7, 0xb8, 0xc9, 0xd0, 0xe1, 0xf2, 0xa3, 0xb4, 0xc5, 0xd6],
		guid: "d4c3b2a1-f6e5-b8a7-c9d0-e1f2a3b4c5d6",
	},
	{
		bytes: [0x6d, 0x3b, 0xf5, 0x9a, 0x12, 0x4e, 0x7c, 0x41, 0x8b, 0xd2, 0xe0, 0xc5, 0x42, 0x3a, 0xf1, 0x08],
		guid: "9af53b6d-4e12-417c-8bd2-e0c5423af108",
	},
	{
		bytes: [0x80, 0x81, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x8b, 0x8c, 0x8d, 0x8e, 0x8f],
		guid: "83828180-8584-8786-8889-8a8b8c8d8e8f",
	},
];

describe("parseObjectGuid", () => {
	it.each(VECTORS)("decodes $guid", ({ bytes, guid }) => {
		expect(parseObjectGuid(Buffer.from(bytes))).toBe(guid);
	});

	it("rejects anything that is not 16 bytes", () => {
		expect(() => parseObjectGuid(Buffer.from([1, 2, 3]))).toThrow("exactly 16 bytes");
		expect(() => parseObjectGuid(Buffer.alloc(17))).toThrow("exactly 16 bytes");
	});

	it("handles an all-zero GUID", () => {
		expect(parseObjectGuid(Buffer.alloc(16))).toBe("00000000-0000-0000-0000-000000000000");
	});
});

describe("guidToLdapFilter", () => {
	it.each(VECTORS)("round-trips $guid back to the original bytes", ({ bytes, guid }) => {
		const filter = guidToLdapFilter(guid);
		const decoded = Buffer.from(
			filter
				.split("\\")
				.filter(Boolean)
				.map((byte) => Number.parseInt(byte, 16)),
		);
		expect(decoded.equals(Buffer.from(bytes))).toBe(true);
	});

	it("escapes every byte, so the filter is safe to interpolate", () => {
		const filter = guidToLdapFilter(VECTORS[0].guid);
		expect(filter).toBe("\\a1\\b2\\c3\\d4\\e5\\f6\\a7\\b8\\c9\\d0\\e1\\f2\\a3\\b4\\c5\\d6");
		expect(filter.match(/\\/g)).toHaveLength(16);
	});

	it("rejects malformed input", () => {
		expect(() => guidToLdapFilter("not-a-guid")).toThrow("Invalid GUID");
		expect(() => guidToLdapFilter("")).toThrow("Invalid GUID");
	});

	it("accepts upper case", () => {
		expect(guidToLdapFilter(VECTORS[0].guid.toUpperCase())).toBe(guidToLdapFilter(VECTORS[0].guid));
	});
});

describe("normalizeEntryUuid", () => {
	it("lowercases a valid UUID", () => {
		expect(normalizeEntryUuid("550E8400-E29B-41D4-A716-446655440000")).toBe("550e8400-e29b-41d4-a716-446655440000");
	});

	it("returns null for anything that is not a UUID", () => {
		expect(normalizeEntryUuid("nope")).toBeNull();
		expect(normalizeEntryUuid("550e8400e29b41d4a716446655440000")).toBeNull();
	});
});

describe("extractDirectoryGuid", () => {
	it("prefers objectGUID", () => {
		expect(
			extractDirectoryGuid({
				objectGUID: Buffer.from(VECTORS[0].bytes),
				entryUUID: "550e8400-e29b-41d4-a716-446655440000",
			}),
		).toEqual({ guid: VECTORS[0].guid, source: "objectGUID" });
	});

	it("falls back to entryUUID", () => {
		expect(extractDirectoryGuid({ entryUUID: "550e8400-e29b-41d4-a716-446655440000" })).toEqual({
			guid: "550e8400-e29b-41d4-a716-446655440000",
			source: "entryUUID",
		});
	});

	it("unwraps single-element arrays, which is how some servers reply", () => {
		expect(extractDirectoryGuid({ objectGUID: [Buffer.from(VECTORS[1].bytes)] })).toEqual({
			guid: VECTORS[1].guid,
			source: "objectGUID",
		});
	});

	it("falls through to entryUUID when objectGUID is the wrong length", () => {
		expect(
			extractDirectoryGuid({
				objectGUID: Buffer.from([1, 2, 3]),
				entryUUID: "550e8400-e29b-41d4-a716-446655440000",
			}),
		).toEqual({ guid: "550e8400-e29b-41d4-a716-446655440000", source: "entryUUID" });
	});

	it("returns null when the directory publishes neither, so the caller can fall back to the DN", () => {
		expect(extractDirectoryGuid({ cn: "alice" })).toBeNull();
		expect(extractDirectoryGuid(null)).toBeNull();
	});
});
