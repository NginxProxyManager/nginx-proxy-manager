import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import Router from "src/Router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authState } = vi.hoisted(() => ({ authState: { authenticated: true } }));

vi.mock("src/context", () => ({ useAuthState: () => authState }));
vi.mock("src/hooks", () => ({
	useHealth: () => ({ data: { status: "OK", setup: true }, isLoading: false, isError: false }),
}));
vi.mock("src/components", () => ({
	Page: ({ children }: { children: ReactNode }) => children,
	SiteContainer: ({ children }: { children: ReactNode }) => children,
	SiteHeader: () => null,
	SiteMenu: () => null,
	SiteFooter: () => null,
	LoadingPage: () => <div>Loading</div>,
	Unhealthy: () => <div>Unhealthy</div>,
	ErrorNotFound: () => <h1>Not found</h1>,
}));
vi.mock("src/pages/Dashboard", () => ({ default: () => <h1>Dashboard</h1> }));
vi.mock("src/pages/Login", () => ({ default: () => <h1>Login</h1> }));
vi.mock("src/pages/Nginx/ProxyHosts", () => ({ default: () => <h1>Proxy hosts</h1> }));

describe("Router", () => {
	beforeEach(() => {
		authState.authenticated = true;
		window.history.replaceState(null, "", "/");
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it.each(["/login", "/login/", "/login?next=/users#form"])(
		"redirects an authenticated visit to %s to the dashboard",
		async (path) => {
			window.history.replaceState(null, "", path);
			const replaceState = vi.spyOn(window.history, "replaceState");
			render(<Router />);

			expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeVisible();
			expect(window.location.pathname).toBe("/");
			expect(window.location.search).toBe("");
			expect(window.location.hash).toBe("");
			expect(replaceState).toHaveBeenCalledWith(expect.anything(), "", "/");
		},
	);

	it("shows the login form when signed out and redirects after sign-in", async () => {
		authState.authenticated = false;
		window.history.replaceState(null, "", "/login");
		const { rerender } = render(<Router />);

		expect(await screen.findByRole("heading", { name: "Login" })).toBeVisible();
		expect(window.location.pathname).toBe("/login");

		authState.authenticated = true;
		rerender(<Router />);

		expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeVisible();
		await waitFor(() => expect(window.location.pathname).toBe("/"));
	});

	it.each([
		["/", "Dashboard"],
		["/nginx/proxy", "Proxy hosts"],
		["/unknown", "Not found"],
	])("preserves the existing route for %s", async (path, heading) => {
		window.history.replaceState(null, "", path);
		render(<Router />);

		expect(await screen.findByRole("heading", { name: heading })).toBeVisible();
		expect(window.location.pathname).toBe(path);
	});
});
