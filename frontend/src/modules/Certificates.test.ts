import { certificateDomainChanged } from "src/modules/Certificates";
import { describe, expect, it } from "vitest";

describe("certificateDomainChanged", () => {
	it("returns false when the certificate has no existing domains", () => {
		expect(certificateDomainChanged([], "test.example.com")).toBe(false);
		expect(certificateDomainChanged(undefined, "test.example.com")).toBe(false);
	});

	it("returns false when the new CN matches the existing domain", () => {
		expect(certificateDomainChanged(["test.example.com"], "test.example.com")).toBe(false);
	});

	it("matches domains case-insensitively", () => {
		expect(certificateDomainChanged(["Test.Example.com"], "test.example.COM")).toBe(false);
	});

	it("returns true when the new CN differs from the existing domain", () => {
		expect(certificateDomainChanged(["test.example.com"], "other.example.com")).toBe(true);
	});

	it("returns false when the new CN matches any of the existing domains", () => {
		expect(certificateDomainChanged(["a.example.com", "b.example.com"], "b.example.com")).toBe(false);
	});

	it("returns true when the new certificate has no CN but the record has domains", () => {
		expect(certificateDomainChanged(["test.example.com"], undefined)).toBe(true);
		expect(certificateDomainChanged(["test.example.com"], "")).toBe(true);
	});
});
