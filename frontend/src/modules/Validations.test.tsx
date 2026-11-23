import { describe, expect, it } from "vitest";
import { validateForwardHost } from "./Validations";

describe("validateForwardHost", () => {
	it("checks the trimmed value like the server stores it", () => {
		expect(validateForwardHost("")).toMatch(/required/);
		expect(validateForwardHost("   ")).toMatch(/required/);
		expect(validateForwardHost(" app ")).toBeUndefined();
		expect(validateForwardHost(`${"a".repeat(255)}  `)).toBeUndefined();
		expect(validateForwardHost("a".repeat(256))).toBeTruthy();
	});

	it("accepts what the server accepts, including nginx variables", () => {
		for (const host of ["$backend", "10.0.0.2", "fd00::1", "app.internal"]) {
			expect(validateForwardHost(host)).toBeUndefined();
		}
	});
});
