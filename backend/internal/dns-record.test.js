import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./dns/index.js", () => ({
	getDriver: vi.fn(),
}));
vi.mock("../models/dns_provider.js", () => ({
	default: { query: vi.fn() },
}));

import dnsProviderModel from "../models/dns_provider.js";
import { getDriver } from "./dns/index.js";
import { cleanup, diffDomains, sync } from "./dns-record.js";

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

const provider = {
	id: 1,
	type: "selectel",
	credentials: { account_id: "1", project_name: "p", username: "u", password: "x" },
	default_ip: "203.0.113.5",
	ttl: 300,
};

const mockProvider = () => {
	dnsProviderModel.query.mockReturnValue({
		where: () => ({ first: async () => provider }),
	});
};

afterEach(() => vi.clearAllMocks());

describe("sync", () => {
	it("no-op when host has no provider", async () => {
		const res = await sync({ dns_provider_id: 0, domain_names: ["a.com"], meta: {} });
		expect(res).toEqual({ dns_synced: false, dns_err: null, dns_records: [] });
	});

	it("creates records for new domains and stores rrset ids", async () => {
		mockProvider();
		const createRecord = vi.fn().mockResolvedValue({ zone_id: "z", rrset_id: "r1" });
		getDriver.mockReturnValue({ createRecord, deleteRecord: vi.fn() });

		const res = await sync({ dns_provider_id: 1, domain_names: ["a.com"], meta: {} });

		expect(createRecord).toHaveBeenCalledWith(provider.credentials, "a.com", "203.0.113.5", 300);
		expect(res.dns_synced).toBe(true);
		expect(res.dns_err).toBeNull();
		expect(res.dns_records).toEqual([{ domain: "a.com", zone_id: "z", rrset_id: "r1" }]);
	});

	it("captures error into dns_err without throwing", async () => {
		mockProvider();
		getDriver.mockReturnValue({
			createRecord: vi.fn().mockRejectedValue(new Error("boom")),
			deleteRecord: vi.fn(),
		});
		const res = await sync({ dns_provider_id: 1, domain_names: ["a.com"], meta: {} });
		expect(res.dns_synced).toBe(false);
		expect(res.dns_err).toMatch(/boom/);
	});
});

describe("cleanup", () => {
	it("deletes all recorded rrsets", async () => {
		mockProvider();
		const deleteRecord = vi.fn().mockResolvedValue();
		getDriver.mockReturnValue({ deleteRecord, createRecord: vi.fn() });
		await cleanup({
			dns_provider_id: 1,
			meta: { dns_records: [{ domain: "a.com", zone_id: "z", rrset_id: "r1" }] },
		});
		expect(deleteRecord).toHaveBeenCalledWith(provider.credentials, { zone_id: "z", rrset_id: "r1" });
	});
});
