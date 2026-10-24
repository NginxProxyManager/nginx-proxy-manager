import { afterEach, expect, it, vi } from "vitest";
import AuthStore from "src/modules/AuthStore";
import { refreshToken } from "./refreshToken";

afterEach(() => { vi.unstubAllGlobals(); AuthStore.clear(); });

it("refreshes the current server-bound session through the actual POST route and unwraps the token", async () => {
	AuthStore.set({ token: "current-session", expires: 9999999999 });
	const refreshed = { token: "refreshed-session", expires: 9999999999 };
	const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: refreshed }) });
	vi.stubGlobal("fetch", request);
	expect(await refreshToken()).toEqual(refreshed);
	expect(request).toHaveBeenCalledWith("/api/auth/refresh", expect.objectContaining({
		method: "POST", headers: expect.objectContaining({ Authorization: "Bearer current-session" }),
	}));
});
