import { describe, expect, it } from "vitest";
import { getBaseDomain, getBaseDomainCounts } from "./domainUtils";

describe("getBaseDomain", () => {
	it("returns a plain two-label domain unchanged", () => {
		expect(getBaseDomain("example.dev")).toBe("example.dev");
		expect(getBaseDomain("example.com")).toBe("example.com");
	});

	it("reduces a subdomain to its base domain", () => {
		expect(getBaseDomain("api.example.com")).toBe("example.com");
		expect(getBaseDomain("app.example.com")).toBe("example.com");
		expect(getBaseDomain("a.b.c.example.com")).toBe("example.com");
	});

	it("strips a leading wildcard", () => {
		expect(getBaseDomain("*.example.com")).toBe("example.com");
		expect(getBaseDomain("*.sub.example.com")).toBe("example.com");
	});

	it("uses the last two labels for multi-part suffixes (known trade-off)", () => {
		// Dependency-free rule groups multi-part TLDs one level too shallow.
		expect(getBaseDomain("example.co.uk")).toBe("co.uk");
		expect(getBaseDomain("www.example.co.uk")).toBe("co.uk");
		expect(getBaseDomain("shop.example.com.au")).toBe("com.au");
	});

	it("normalises case and trailing dots", () => {
		expect(getBaseDomain("API.EXAMPLE.COM")).toBe("example.com");
		expect(getBaseDomain("example.com.")).toBe("example.com");
		expect(getBaseDomain("  api.example.com  ")).toBe("example.com");
	});

	it("falls back to the cleaned input for single-label or empty values", () => {
		expect(getBaseDomain("localhost")).toBe("localhost");
		expect(getBaseDomain("")).toBe("");
	});
});

describe("getBaseDomainCounts", () => {
	it("counts hosts per base domain, sorted alphabetically", () => {
		const result = getBaseDomainCounts([["alpha.dev"], ["api.beta.com", "app.beta.com"], ["gamma.com"]]);
		expect(result).toEqual([
			{ base: "alpha.dev", count: 1 },
			{ base: "beta.com", count: 1 },
			{ base: "gamma.com", count: 1 },
		]);
	});

	it("counts a host once per base even with several matching subdomains", () => {
		const result = getBaseDomainCounts([["api.beta.com", "app.beta.com", "beta.com"]]);
		expect(result).toEqual([{ base: "beta.com", count: 1 }]);
	});

	it("aggregates the same base across multiple hosts", () => {
		const result = getBaseDomainCounts([["api.beta.com"], ["www.beta.com"], ["other.dev"]]);
		expect(result).toEqual([
			{ base: "beta.com", count: 2 },
			{ base: "other.dev", count: 1 },
		]);
	});

	it("ignores empty or missing domain lists", () => {
		expect(getBaseDomainCounts([[], ["example.com"]])).toEqual([{ base: "example.com", count: 1 }]);
	});
});
