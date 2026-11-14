import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OAuth2Success from ".";
import type { ReactNode } from "react";

const { authState } = vi.hoisted(() => ({
	authState: {
		authenticated: false,
		loginSingleSignOnUser: (_token: string, _expiry: string) => Promise.resolve(),
	},
}));

vi.mock("src/context", () => ({ useAuthState: () => authState }));
vi.mock("src/hooks", () => ({
	useHealth: () => ({
		data: { status: "OK", setup: true, version: { major: 2, minor: 17 } },
		isLoading: false,
		isError: false,
	}),
}));
vi.mock("src/components", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...(actual as ReactNode[]),
		Page: ({ children }: { children: ReactNode }) => children,
		SiteContainer: ({ children }: { children: ReactNode }) => children,
		LocalePicker: () => <div>LocalePicker</div>,
		ThemeSwitcher: () => <div>ThemeSwitcher</div>,
		SiteHeader: () => null,
		SiteMenu: () => null,
		SiteFooter: () => null,
		LoadingPage: () => <div>Loading</div>,
		Unhealthy: () => <div>Unhealthy</div>,
		ErrorNotFound: () => <h1>Not found</h1>,
	};
});
beforeEach(async () => {
	Promise.all([
		window.cookieStore.set({
			name: "npm_sso_t",
			value: "foo-token",
			expires: Date.now() + 86400,
			path: "/",
		}),
		window.cookieStore.set({
			name: "npm_sso_e",
			value: "2026-10-10T00:00:00Z",
			expires: Date.now() + 86400,
			path: "/",
		}),
		window.cookieStore.set({
			name: "npm_sso_s",
			value: "qux-state",
			expires: Date.now() + 86400,
			path: "/",
		}),
		window.cookieStore.set({
			name: "npm_sso_n",
			value: "baz-verifier",
			expires: Date.now() + 86400,
			path: "/",
		}),
	]);
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("OAuthSuccess page", () => {
	it("registers authentication state then cleans up", async () => {
		vi.spyOn(authState, "loginSingleSignOnUser").mockImplementation((_token: string, _expiry: string) =>
			Promise.resolve(),
		);
		render(<OAuth2Success />);

		expect(authState.loginSingleSignOnUser).toHaveBeenCalledWith("foo-token", 1791590400000);

		await vi.dynamicImportSettled();
		expect(document.cookie).not.toContain("npm_sso_t");
		expect(document.cookie).not.toContain("npm_sso_e");
		expect(document.cookie).not.toContain("npm_sso_n");
		expect(document.cookie).not.toContain("npm_sso_s");
	});
});
