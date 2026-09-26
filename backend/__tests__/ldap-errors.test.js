import { describe, expect, it } from "vitest";
import { describeLdapError } from "../lib/auth/ldap.js";

describe("describeLdapError", () => {
	it("explains the common protocol result codes", () => {
		expect(describeLdapError({ code: 49 })).toMatch(/Invalid credentials/);
		expect(describeLdapError({ code: 32 })).toMatch(/base DN/);
		expect(describeLdapError({ code: 8 })).toMatch(/LDAPS or StartTLS/);
		expect(describeLdapError({ code: 50 })).toMatch(/permission/);
	});

	it("explains connection level failures", () => {
		expect(describeLdapError({ code: "ECONNREFUSED" })).toMatch(/Connection refused/);
		expect(describeLdapError({ code: "ENOTFOUND" })).toMatch(/Server not found/);
		expect(describeLdapError({ code: "ETIMEDOUT" })).toMatch(/timed out/);
	});

	it("explains an untrusted certificate", () => {
		expect(describeLdapError({ code: "DEPTH_ZERO_SELF_SIGNED_CERT" })).toMatch(/TLS certificate/);
		expect(describeLdapError({ code: "SELF_SIGNED_CERT_IN_CHAIN" })).toMatch(/TLS certificate/);
	});

	it("never returns the bare result code that ldapts produces on its own", () => {
		// The whole point: "Code: 0x31" tells an administrator nothing
		const described = describeLdapError({ code: 49, message: " Code: 0x31" });
		expect(described).not.toBe(" Code: 0x31");
		expect(described).toMatch(/bind DN and password/);
	});

	it("falls back to the driver message for codes it does not know", () => {
		expect(describeLdapError({ code: 9999, message: "something specific" })).toBe("something specific");
	});

	it("copes with an error carrying neither a known code nor a message", () => {
		expect(describeLdapError({ code: 4242 })).toBe("LDAP error (code 4242)");
		expect(describeLdapError(null)).toBe("Unknown LDAP error");
	});
});
