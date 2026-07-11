import { describe, expect, it } from "vitest";
import { diffDomains } from "./dns-record.js";

describe("diffDomains", () => {
	it("creates all when nothing exists", () => {
		const { toCreate, toDelete } = diffDomains(["a.com", "b.com"], []);
		expect(toCreate).toEqual(["a.com", "b.com"]);
		expect(toDelete).toEqual([]);
	});

	it("no-op when identical", () => {
		const existing = [{ domain: "a.com", zone_id: "z", rrset_id: "r" }];
		const { toCreate, toDelete } = diffDomains(["a.com"], existing);
		expect(toCreate).toEqual([]);
		expect(toDelete).toEqual([]);
	});

	it("computes additions and removals on rename", () => {
		const existing = [
			{ domain: "old.com", zone_id: "z", rrset_id: "r1" },
			{ domain: "keep.com", zone_id: "z", rrset_id: "r2" },
		];
		const { toCreate, toDelete } = diffDomains(["keep.com", "new.com"], existing);
		expect(toCreate).toEqual(["new.com"]);
		expect(toDelete).toEqual([{ domain: "old.com", zone_id: "z", rrset_id: "r1" }]);
	});
});
