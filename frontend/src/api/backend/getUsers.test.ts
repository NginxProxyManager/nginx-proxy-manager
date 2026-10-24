import { afterEach, describe, expect, it, vi } from "vitest";
import { getUsers } from "./getUsers";

describe("getUsers", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("unwraps the paginated API envelope for the users table", async () => {
		const users = [{ id: 2, name: "SSO administrator", capabilities: ["full-admin"] }];
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ result: { items: users, total: 1 } }),
		} as Response));

		await expect(getUsers()).resolves.toEqual(users);
	});
});
