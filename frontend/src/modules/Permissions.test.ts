import { describe, expect, it } from "vitest";
import { FULL_ADMIN, hasCapability, hasPermission, HOSTS, MANAGE, SETTINGS, VIEW } from "./Permissions";

describe("capability authorization", () => {
	it("uses exact view and manage capabilities", () => {
		expect(hasPermission(HOSTS, VIEW, ["hosts.view"])).toBe(true);
		expect(hasPermission(HOSTS, VIEW, ["hosts.manage"])).toBe(false);
		expect(hasPermission(HOSTS, MANAGE, ["hosts.view"])).toBe(false);
		expect(hasCapability(["users.manage"], SETTINGS)).toBe(false);
		expect(hasCapability([], "hosts.view")).toBe(false);
	});

	it("lets full-admin satisfy every known capability", () => {
		expect(hasCapability([FULL_ADMIN], "settings.manage")).toBe(true);
		expect(hasPermission(HOSTS, MANAGE, [FULL_ADMIN])).toBe(true);
	});
});
