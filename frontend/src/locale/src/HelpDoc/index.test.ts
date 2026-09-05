import { describe, expect, it } from "vitest";
import { getHelpFile } from ".";

describe("help document lookup", () => {
	it("uses the requested language, falls back to English, and rejects missing sections", () => {
		expect(getHelpFile("zh", "ProxyHosts")).toMatch(/ProxyHosts\.md/);
		expect(getHelpFile("unsupported", "Certificates")).toMatch(/en\/Certificates\.md/);
		expect(() => getHelpFile("unsupported", "MissingSection")).toThrow("Cannot load help doc for unsupported-MissingSection");
	});
});
