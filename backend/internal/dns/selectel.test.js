import { describe, expect, it } from "vitest";
import { resolveZone } from "./selectel.js";

describe("resolveZone", () => {
	const zones = [
		{ id: "z1", name: "example.com" },
		{ id: "z2", name: "sub.example.com" },
		{ id: "z3", name: "other.org" },
	];

	it("matches exact zone", () => {
		expect(resolveZone("example.com", zones)?.id).toBe("z1");
	});

	it("matches subdomain to parent zone", () => {
		expect(resolveZone("app.example.com", zones)?.id).toBe("z1");
	});

	it("prefers the longest matching zone", () => {
		expect(resolveZone("api.sub.example.com", zones)?.id).toBe("z2");
	});

	it("returns null when no zone matches", () => {
		expect(resolveZone("nomatch.net", zones)).toBeNull();
	});

	it("does not match partial label (foobar vs bar)", () => {
		expect(resolveZone("foobarexample.com", [{ id: "z9", name: "barexample.com" }])).toBeNull();
	});

	it("matches case-insensitively", () => {
		expect(resolveZone("APP.Example.COM", zones)?.id).toBe("z1");
	});

	it("tolerates a trailing dot on the domain", () => {
		expect(resolveZone("app.example.com.", zones)?.id).toBe("z1");
	});
});
