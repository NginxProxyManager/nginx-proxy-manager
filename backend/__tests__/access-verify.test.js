import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticate = vi.fn();
vi.mock("../lib/auth/ldap.js", () => ({ authenticate: (...args) => authenticate(...args) }));

const { check, groupsAllow, invalidate, verify } = await import("../lib/auth/access-verify.js");

const ldapProvider = { id: 1, name: "Company LDAP", type: "ldap" };

const listWith = (overrides = {}) => ({
	id: 7,
	items: [],
	allowed_groups: [],
	...overrides,
});

beforeEach(() => {
	authenticate.mockReset();
	invalidate();
});

describe("groupsAllow", () => {
	it("allows anyone when no groups are configured", () => {
		expect(groupsAllow([], ["anything"])).toBe(true);
		expect(groupsAllow(undefined, [])).toBe(true);
	});

	it("allows a member of one of the groups", () => {
		expect(groupsAllow(["cn=vpn,ou=g"], ["cn=staff,ou=g", "cn=vpn,ou=g"])).toBe(true);
	});

	it("refuses somebody in none of them", () => {
		expect(groupsAllow(["cn=vpn,ou=g"], ["cn=staff,ou=g"])).toBe(false);
		expect(groupsAllow(["cn=vpn,ou=g"], [])).toBe(false);
		expect(groupsAllow(["cn=vpn,ou=g"], undefined)).toBe(false);
	});

	it("ignores case and surrounding whitespace, since directories vary", () => {
		expect(groupsAllow(["  CN=VPN,OU=G  "], ["cn=vpn,ou=g"])).toBe(true);
	});

	it("requires a whole match rather than a prefix", () => {
		expect(groupsAllow(["cn=vpn,ou=g"], ["cn=vpn-readonly,ou=g"])).toBe(false);
	});
});

describe("check", () => {
	it("refuses empty credentials without troubling the directory", async () => {
		const result = await check(listWith(), [ldapProvider], "", "");
		expect(result.allowed).toBe(false);
		expect(authenticate).not.toHaveBeenCalled();
	});

	it("refuses a blank password, which would otherwise be an anonymous bind", async () => {
		const result = await check(listWith(), [ldapProvider], "alice", "");
		expect(result.allowed).toBe(false);
		expect(authenticate).not.toHaveBeenCalled();
	});

	it("accepts an entry from the list itself without asking a provider", async () => {
		const list = listWith({ items: [{ username: "local", password: "secret" }] });
		const result = await check(list, [ldapProvider], "local", "secret");

		expect(result).toMatchObject({ allowed: true, via: "list" });
		expect(authenticate).not.toHaveBeenCalled();
	});

	it("refuses a list entry with the wrong password", async () => {
		const list = listWith({ items: [{ username: "local", password: "secret" }] });
		expect((await check(list, [], "local", "nope")).allowed).toBe(false);
	});

	it("accepts a directory user the provider recognises", async () => {
		authenticate.mockResolvedValue({ email: "alice@example.com", groups: [] });
		const result = await check(listWith(), [ldapProvider], "alice", "pw");

		expect(result).toMatchObject({ allowed: true, via: "Company LDAP", email: "alice@example.com" });
	});

	it("refuses a directory user outside the allowed groups", async () => {
		authenticate.mockResolvedValue({ email: "bob@example.com", groups: ["cn=staff,ou=g"] });
		const result = await check(listWith({ allowed_groups: ["cn=vpn,ou=g"] }), [ldapProvider], "bob", "pw");

		expect(result.allowed).toBe(false);
		expect(result.reason).toMatch(/group/);
	});

	it("accepts a directory user inside the allowed groups", async () => {
		authenticate.mockResolvedValue({ email: "bob@example.com", groups: ["cn=vpn,ou=g"] });
		const result = await check(listWith({ allowed_groups: ["cn=vpn,ou=g"] }), [ldapProvider], "bob", "pw");

		expect(result.allowed).toBe(true);
	});

	it("lets a list entry through even when groups are restricted", async () => {
		const list = listWith({ items: [{ username: "local", password: "secret" }], allowed_groups: ["cn=vpn,ou=g"] });
		expect((await check(list, [ldapProvider], "local", "secret")).allowed).toBe(true);
	});

	it("skips providers that cannot verify a password presented to us", async () => {
		const result = await check(listWith(), [{ id: 2, name: "SSO", type: "oauth" }], "alice", "pw");

		expect(result.allowed).toBe(false);
		expect(authenticate).not.toHaveBeenCalled();
	});

	it("moves on to the next provider when one throws", async () => {
		authenticate
			.mockRejectedValueOnce(new Error("directory is down"))
			.mockResolvedValueOnce({ email: "alice@example.com", groups: [] });

		const result = await check(
			listWith(),
			[
				{ id: 1, name: "Broken", type: "ldap" },
				{ id: 2, name: "Working", type: "ldap" },
			],
			"alice",
			"pw",
		);

		expect(result).toMatchObject({ allowed: true, via: "Working" });
	});

	it("refuses when every provider fails, rather than falling open", async () => {
		authenticate.mockRejectedValue(new Error("directory is down"));
		expect((await check(listWith(), [ldapProvider], "alice", "pw")).allowed).toBe(false);
	});
});

describe("verify", () => {
	it("answers a repeated request from cache instead of asking again", async () => {
		authenticate.mockResolvedValue({ email: "alice@example.com", groups: [] });

		const first = await verify(listWith(), [ldapProvider], "alice", "pw");
		const second = await verify(listWith(), [ldapProvider], "alice", "pw");

		expect(first.allowed).toBe(true);
		expect(second.allowed).toBe(true);
		expect(second.cached).toBe(true);
		expect(authenticate).toHaveBeenCalledTimes(1);
	});

	it("does not let a cached pass cover a different password", async () => {
		authenticate.mockResolvedValueOnce({ email: "alice@example.com", groups: [] }).mockResolvedValueOnce(null);

		expect((await verify(listWith(), [ldapProvider], "alice", "right")).allowed).toBe(true);
		expect((await verify(listWith(), [ldapProvider], "alice", "wrong")).allowed).toBe(false);
	});

	it("does not let one list's decision apply to another", async () => {
		authenticate.mockResolvedValue({ email: "alice@example.com", groups: [] });

		await verify(listWith({ id: 1 }), [ldapProvider], "alice", "pw");
		await verify(listWith({ id: 2 }), [ldapProvider], "alice", "pw");

		expect(authenticate).toHaveBeenCalledTimes(2);
	});

	it("forgets its decisions when a list changes", async () => {
		authenticate.mockResolvedValue({ email: "alice@example.com", groups: [] });

		await verify(listWith(), [ldapProvider], "alice", "pw");
		invalidate(7);
		await verify(listWith(), [ldapProvider], "alice", "pw");

		expect(authenticate).toHaveBeenCalledTimes(2);
	});
});
