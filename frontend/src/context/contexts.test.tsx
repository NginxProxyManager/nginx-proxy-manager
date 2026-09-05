import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
	getToken: vi.fn(),
	isTwoFactorChallenge: vi.fn(),
	loginAsUser: vi.fn(),
	refreshToken: vi.fn(),
	verify2FA: vi.fn(),
}));
const store = vi.hoisted(() => ({
	hasActiveToken: vi.fn(),
	set: vi.fn(),
	add: vi.fn(),
	count: vi.fn(),
	drop: vi.fn(),
	clear: vi.fn(),
}));
const queryClient = vi.hoisted(() => ({ clear: vi.fn() }));
const interval = vi.hoisted(() => ({ callback: undefined as undefined | (() => void) }));

vi.mock("src/api/backend", () => api);
vi.mock("src/modules/AuthStore", () => ({ default: store }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => queryClient }));
vi.mock("rooks", () => ({ useIntervalWhen: (callback: () => void) => { interval.callback = callback; } }));
vi.mock("src/locale", () => ({ getLocale: () => "en" }));

import { AuthProvider, useAuthState } from "./AuthContext";
import { LocaleProvider, useLocaleState } from "./LocaleContext";
import { Dark, Light, ThemeProvider, useTheme } from "./ThemeContext";

let authValue: ReturnType<typeof useAuthState>;
const AuthConsumer = () => {
	authValue = useAuthState();
	return <div>{authValue.authenticated ? "authenticated" : "anonymous"}</div>;
};
let localeValue: ReturnType<typeof useLocaleState>;
const LocaleConsumer = () => {
	localeValue = useLocaleState();
	return <div>{localeValue.locale}</div>;
};
let themeValue: ReturnType<typeof useTheme>;
const ThemeConsumer = () => {
	themeValue = useTheme();
	return <div>{themeValue.theme}</div>;
};

afterEach(cleanup);

describe("application contexts", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		localStorage.clear();
		store.hasActiveToken.mockReturnValue(false);
		store.count.mockReturnValue(1);
		api.getToken.mockResolvedValue({ token: "token", expires: "tomorrow" });
		api.isTwoFactorChallenge.mockReturnValue(false);
		api.verify2FA.mockResolvedValue({ token: "verified", expires: "tomorrow" });
		api.refreshToken.mockResolvedValue({ token: "fresh", expires: "tomorrow" });
		api.loginAsUser.mockResolvedValue({ token: "other", expires: "tomorrow" });
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: vi.fn(() => ({ matches: false })),
		});
	});

	it("requires each consumer hook to be inside its provider", () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
		expect(() => render(<AuthConsumer />)).toThrow(/AuthProvider/);
		expect(() => render(<LocaleConsumer />)).toThrow(/LocaleProvider/);
		expect(() => render(<ThemeConsumer />)).toThrow(/ThemeProvider/);
		consoleError.mockRestore();
	});

	it("authenticates normally, refreshes, and logs out", async () => {
		render(<AuthProvider><AuthConsumer /></AuthProvider>);
		expect(screen.getByText("anonymous")).toBeInTheDocument();
		await act(() => authValue.login("owner", "secret"));
		expect(api.getToken).toHaveBeenCalledWith("owner", "secret");
		expect(store.set).toHaveBeenCalledWith({ token: "token", expires: "tomorrow" });
		expect(screen.getByText("authenticated")).toBeInTheDocument();
		await act(async () => interval.callback?.());
		expect(api.refreshToken).toHaveBeenCalledOnce();
		expect(store.set).toHaveBeenLastCalledWith({ token: "fresh", expires: "tomorrow" });

		act(() => authValue.logout());
		expect(store.clear).toHaveBeenCalledOnce();
		expect(queryClient.clear).toHaveBeenCalledOnce();
		expect(screen.getByText("anonymous")).toBeInTheDocument();
	});

	it("handles two-factor challenge, cancellation, and verification", async () => {
		api.isTwoFactorChallenge.mockReturnValue(true);
		api.getToken.mockResolvedValue({ requires2fa: true, challengeToken: "challenge" });
		render(<AuthProvider><AuthConsumer /></AuthProvider>);
		await expect(authValue.verifyTwoFactor("123456")).rejects.toThrow(/No 2FA/);
		await act(() => authValue.login("owner", "secret"));
		expect(authValue.twoFactorChallenge).toEqual({ challengeToken: "challenge" });
		act(() => authValue.cancelTwoFactor());
		expect(authValue.twoFactorChallenge).toBeNull();

		await act(() => authValue.login("owner", "secret"));
		await act(() => authValue.verifyTwoFactor("123456"));
		expect(api.verify2FA).toHaveBeenCalledWith("challenge", "123456");
		expect(store.set).toHaveBeenCalledWith({ token: "verified", expires: "tomorrow" });
	});

	it("restores the prior identity when logging out of an impersonation", () => {
		store.hasActiveToken.mockReturnValue(true);
		store.count.mockReturnValue(2);
		render(<AuthProvider><AuthConsumer /></AuthProvider>);
		act(() => authValue.logout());
		expect(store.drop).toHaveBeenCalledOnce();
		expect(store.clear).not.toHaveBeenCalled();
		expect(queryClient.clear).toHaveBeenCalledOnce();
	});

	it("does not refresh an anonymous session", async () => {
		render(<AuthProvider><AuthConsumer /></AuthProvider>);
		await act(async () => interval.callback?.());
		expect(api.refreshToken).not.toHaveBeenCalled();
	});

	it("updates locale state", async () => {
		render(<LocaleProvider><LocaleConsumer /></LocaleProvider>);
		expect(screen.getByText("en")).toBeInTheDocument();
		await act(() => localeValue.setLocale("zh-CN"));
		expect(screen.getByText("zh-CN")).toBeInTheDocument();
	});

	it("uses browser and stored themes, toggles, and applies document state", () => {
		const first = render(<ThemeProvider><ThemeConsumer /></ThemeProvider>);
		expect(themeValue.getTheme()).toBe(Light);
		act(() => themeValue.toggleTheme());
		expect(themeValue.getTheme()).toBe(Dark);
		expect(document.body).toHaveClass("dark");
		expect(document.documentElement.getAttribute("data-bs-theme")).toBe("dark");
		act(() => themeValue.setTheme(Light));
		expect(localStorage.getItem("tabler-theme")).toBe(Light);
		first.unmount();

		localStorage.setItem("tabler-theme", Dark);
		render(<ThemeProvider><ThemeConsumer /></ThemeProvider>);
		expect(themeValue.getTheme()).toBe(Dark);
	});
});
