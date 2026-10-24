import { afterEach, expect, it, vi } from "vitest";
import AuthStore from "src/modules/AuthStore";
import { loginAsUser } from "./loginAsUser";

afterEach(() => { vi.unstubAllGlobals(); AuthStore.clear(); });

it("unwraps the impersonation token from the result envelope", async () => {
	AuthStore.set({ token: "admin-session", expires: 9999999999 });
	const impersonated = { token: "user-session", expires: 9999999999 };
	const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: impersonated }) });
	vi.stubGlobal("fetch", request);
	expect(await loginAsUser(7)).toEqual(impersonated);
	expect(request).toHaveBeenCalledWith("/api/users/7/login", expect.objectContaining({ method: "POST" }));
});
