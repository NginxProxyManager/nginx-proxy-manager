import { describe, expect, it } from "vitest";
import { buildUserFilter, escapeFilterValue } from "../lib/auth/ldap.js";

describe("escapeFilterValue", () => {
	it("escapes the characters that would otherwise close or extend a filter", () => {
		expect(escapeFilterValue("(")).toBe("\\28");
		expect(escapeFilterValue(")")).toBe("\\29");
		expect(escapeFilterValue("*")).toBe("\\2a");
		expect(escapeFilterValue("\\")).toBe("\\5c");
		expect(escapeFilterValue("\0")).toBe("\\00");
	});

	it("leaves ordinary values alone", () => {
		expect(escapeFilterValue("alice")).toBe("alice");
		expect(escapeFilterValue("alice@example.com")).toBe("alice@example.com");
		expect(escapeFilterValue("cn=alice,ou=users,dc=example,dc=com")).toBe("cn=alice,ou=users,dc=example,dc=com");
	});

	it("neutralises a wildcard, so a blank password cannot match every account", () => {
		expect(escapeFilterValue("*")).not.toContain("*");
	});

	it("neutralises an attempted filter injection", () => {
		// Without escaping this would turn (uid=X) into an OR that always matches
		const injected = "x)(|(uid=*";
		const escaped = escapeFilterValue(injected);
		expect(escaped).toBe("x\\29\\28|\\28uid=\\2a");
		expect(escaped).not.toMatch(/[()*]/);
	});

	it("escapes a backslash before anything else, so escapes cannot be forged", () => {
		// A naive implementation that replaced ( before \ would turn this into
		// a real parenthesis
		expect(escapeFilterValue("\\28")).toBe("\\5c28");
	});

	it("coerces non-strings rather than throwing", () => {
		expect(escapeFilterValue(42)).toBe("42");
	});
});

describe("buildUserFilter", () => {
	it("uses a hand written filter when one is set", () => {
		expect(buildUserFilter({ user_filter: "(uid={{username}})" }, "alice")).toBe("(uid=alice)");
	});

	it("substitutes every occurrence of the placeholder", () => {
		expect(buildUserFilter({ user_filter: "(|(uid={{username}})(mail={{username}}))" }, "alice")).toBe(
			"(|(uid=alice)(mail=alice))",
		);
	});

	it("escapes the value before substituting it", () => {
		expect(buildUserFilter({ user_filter: "(uid={{username}})" }, "x)(|(uid=*")).toBe(
			"(uid=x\\29\\28|\\28uid=\\2a)",
		);
	});

	it("builds a single clause from one login attribute", () => {
		expect(buildUserFilter({ login_attributes: "uid" }, "alice")).toBe("(uid=alice)");
	});

	it("builds an OR from several login attributes", () => {
		expect(buildUserFilter({ login_attributes: "uid, mail, sAMAccountName" }, "alice")).toBe(
			"(|(uid=alice)(mail=alice)(sAMAccountName=alice))",
		);
	});

	it("prefers a hand written filter over login attributes", () => {
		expect(buildUserFilter({ user_filter: "(cn={{username}})", login_attributes: "uid,mail" }, "alice")).toBe(
			"(cn=alice)",
		);
	});

	it("falls back to uid when nothing is configured", () => {
		expect(buildUserFilter({}, "alice")).toBe("(uid=alice)");
	});

	it("ignores blank entries in the attribute list", () => {
		expect(buildUserFilter({ login_attributes: "uid,,  ,mail" }, "alice")).toBe("(|(uid=alice)(mail=alice))");
	});
});
