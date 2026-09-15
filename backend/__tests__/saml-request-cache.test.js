import { describe, expect, it } from "vitest";

const { requestCache } = await import("../lib/auth/saml.js");

/**
 * node-saml stores the id of each authentication request it issues and looks it
 * up again when the assertion comes back, refusing anything that does not name
 * a request we are still waiting for. It removes the id once used, which is
 * what makes an assertion single use; these cover the store that behaviour
 * rests on, since a fresh SAML instance is built per request and the default
 * per-instance cache would lose the id in between.
 */
describe("the SAML request cache", () => {
	it("hands back what was stored", async () => {
		await requestCache.saveAsync("id-1", "2026-01-01T00:00:00Z");
		expect(await requestCache.getAsync("id-1")).toBe("2026-01-01T00:00:00Z");
	});

	it("knows nothing about a request it never issued", async () => {
		expect(await requestCache.getAsync("never-issued")).toBeNull();
	});

	it("forgets an id once it has been used, so it cannot answer twice", async () => {
		await requestCache.saveAsync("id-2", "now");
		expect(await requestCache.removeAsync("id-2")).toBe("id-2");
		expect(await requestCache.getAsync("id-2")).toBeNull();
		// A replay removes nothing, because there is nothing left to remove
		expect(await requestCache.removeAsync("id-2")).toBeNull();
	});

	it("refuses to overwrite an id that is already outstanding", async () => {
		await requestCache.saveAsync("id-3", "first");
		expect(await requestCache.saveAsync("id-3", "second")).toBeNull();
		expect(await requestCache.getAsync("id-3")).toBe("first");
	});

	it("copes with a null key, which node-saml passes when there is none", async () => {
		expect(await requestCache.removeAsync(null)).toBeNull();
		expect(await requestCache.getAsync(null)).toBeNull();
	});

	it("drops ids that have sat there past their lifetime", async () => {
		await requestCache.saveAsync("id-4", "stale");
		// Age the entry rather than waiting ten minutes for it
		requestCache.entries.get("id-4").createdAt -= 11 * 60 * 1000;
		expect(await requestCache.getAsync("id-4")).toBeNull();
	});
});
