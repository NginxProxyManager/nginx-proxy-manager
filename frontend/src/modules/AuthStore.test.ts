import { afterEach, expect, it } from "vitest";
import AuthStore, { TOKEN_KEY } from "./AuthStore";

afterEach(() => AuthStore.clear());

it("removes the stored key when the last expired token is dropped", () => {
	AuthStore.set({ token: "expired", expires: 1 });
	expect(AuthStore.hasActiveToken()).toBe(false);
	expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
	expect(AuthStore.snapshot().stored).toBeNull();
});

it("keeps the parent token when only the impersonated token is dropped", () => {
	AuthStore.set({ token: "parent", expires: 9999999999 });
	AuthStore.add({ token: "child", expires: 9999999999 });
	AuthStore.drop();
	expect(AuthStore.tokens).toEqual([{ token: "parent", expires: 9999999999 }]);
});
