import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuthStore, { TOKEN_KEY } from "src/modules/AuthStore";
import { AUTH_INVALIDATED_EVENT, del, get, post, put } from "./base";

const response = (status: number) => ({
	ok: status >= 200 && status < 300,
	status,
	json: async () => ({ error: { message: status === 401 ? "Unauthorised" : "Forbidden" } }),
}) as Response;

describe("API authorization failures", () => {
	beforeEach(() => {
		localStorage.setItem(TOKEN_KEY, JSON.stringify([{ token: "live", expires: 9999999999 }]));
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		localStorage.clear();
	});

	it("invalidates the active app session on 401", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(401)));
		const invalidated = vi.fn();
		window.addEventListener(AUTH_INVALIDATED_EVENT, invalidated, { once: true });
		await expect(get({ url: "/users/me" })).rejects.toThrow("Unauthorised");
		expect(AuthStore.token).toBeNull();
		expect(invalidated).toHaveBeenCalledOnce();
	});

	it("keeps a valid session on 403", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(403)));
		const invalidated = vi.fn();
		window.addEventListener(AUTH_INVALIDATED_EVENT, invalidated, { once: true });
		await expect(get({ url: "/forbidden" })).rejects.toThrow("Forbidden");
		expect(AuthStore.token?.token).toBe("live");
		expect(invalidated).not.toHaveBeenCalled();
	});

	it.each([get, post, put, del])("ignores a delayed 401 sent with the previous account credential (%#)", async (request) => {
		let finish!: (value: Response) => void;
		vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
		const invalidated = vi.fn();
		window.addEventListener(AUTH_INVALIDATED_EVENT, invalidated);
		const pending = request({ url: "/users/me" });
		AuthStore.set({ token: "account-b", expires: 9999999999 });
		finish(response(401));
		await expect(pending).rejects.toThrow("Unauthorised");
		expect(AuthStore.token?.token).toBe("account-b");
		expect(invalidated).not.toHaveBeenCalled();
		window.removeEventListener(AUTH_INVALIDATED_EVENT, invalidated);
	});

	it("does not destroy another session for an anonymous handoff or explicit logout 401", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(401)));
		await expect(post({ url: "/auth/sso/exchange", data: { code: "bad" }, noAuth: true })).rejects.toThrow();
		expect(AuthStore.token?.token).toBe("live");
		await expect(post({ url: "/auth/logout", data: {}, suppressAuthInvalidation: true })).rejects.toThrow();
		expect(AuthStore.token?.token).toBe("live");
	});
});
