import { describe, expect, it, vi } from "vitest";

// provision.js talks to the database; the role mapping this file covers is a
// pure function, so stub the models out rather than opening a connection.
vi.mock("../models/auth.js", () => ({ default: {} }));
vi.mock("../models/user.js", () => ({ default: {} }));
vi.mock("../models/user_permission.js", () => ({ default: {} }));

const { resolveRoles } = await import("../lib/auth/provision.js");

const provider = (adminGroup) => ({ meta: { admin_group: adminGroup } });

describe("resolveRoles", () => {
	it("leaves roles alone when no admin group is configured", () => {
		expect(resolveRoles(provider(""), { groups: ["anything"] }, ["admin"])).toBeNull();
		expect(resolveRoles(provider(undefined), { groups: [] }, [])).toBeNull();
	});

	it("treats a whitespace-only group as not configured", () => {
		expect(resolveRoles(provider("   "), { groups: ["x"] }, [])).toBeNull();
	});

	it("grants admin to a member of the group", () => {
		expect(resolveRoles(provider("npm-admins"), { groups: ["staff", "npm-admins"] }, [])).toEqual(["admin"]);
	});

	it("revokes admin once someone leaves the group", () => {
		expect(resolveRoles(provider("npm-admins"), { groups: ["staff"] }, ["admin"])).toEqual([]);
	});

	it("matches case insensitively, since directories are inconsistent about it", () => {
		expect(resolveRoles(provider("CN=NPM-Admins,OU=Groups"), { groups: ["cn=npm-admins,ou=groups"] }, [])).toEqual([
			"admin",
		]);
	});

	it("requires an exact match, not a substring", () => {
		expect(resolveRoles(provider("npm-admins"), { groups: ["npm-admins-readonly"] }, [])).toEqual([]);
	});

	it("keeps other roles untouched while changing admin", () => {
		expect(resolveRoles(provider("npm-admins"), { groups: ["npm-admins"] }, ["viewer"]).sort()).toEqual([
			"admin",
			"viewer",
		]);
		expect(resolveRoles(provider("npm-admins"), { groups: [] }, ["viewer", "admin"])).toEqual(["viewer"]);
	});

	it("does not duplicate admin for someone who already has it", () => {
		expect(resolveRoles(provider("npm-admins"), { groups: ["npm-admins"] }, ["admin"])).toEqual(["admin"]);
	});

	it("handles a missing group list as no groups", () => {
		expect(resolveRoles(provider("npm-admins"), {}, ["admin"])).toEqual([]);
	});

	it("copes with non-string group values", () => {
		expect(resolveRoles(provider("123"), { groups: [123] }, [])).toEqual(["admin"]);
	});
});
