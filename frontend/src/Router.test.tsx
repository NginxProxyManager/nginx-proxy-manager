import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import Router from "src/Router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authState, userState, completeSSO, hookOptions } = vi.hoisted(() => ({
	authState: { authenticated: true },
	userState: { data: { capabilities: ["full-admin"] }, isLoading: false, isError: false },
	completeSSO: vi.fn(),
	hookOptions: { current: undefined as any },
}));

vi.mock("src/context", () => ({ useAuthState: () => ({ ...authState, completeSSO }) }));
vi.mock("src/hooks", () => ({
	useHealth: () => ({ data: { status: "OK", healthy: true, setup: true, dbSetup: true }, isLoading: false, isError: false }),
	useCurrentUser: (options: any) => { hookOptions.current = options; return userState; },
}));
vi.mock("src/components", () => ({
	Page: ({ children }: { children: ReactNode }) => children,
	SiteContainer: ({ children }: { children: ReactNode }) => children,
	SiteHeader: () => null,
	SiteMenu: () => <div data-testid="site-menu">Menu</div>,
	SiteFooter: () => null,
	LoadingPage: () => <div>Loading</div>,
	Unhealthy: () => <div>Unhealthy</div>,
	ErrorNotFound: () => <h1>Not found</h1>,
}));
vi.mock("src/pages/Dashboard", () => ({ default: () => <h1>Dashboard</h1> }));
vi.mock("src/pages/Login", () => ({ default: () => <h1>Login</h1> }));
vi.mock("src/pages/PendingAccess", () => ({ default: () => <h1>Waiting for access</h1> }));
vi.mock("src/pages/Nginx/ProxyHosts", () => ({ default: () => <h1>Proxy hosts</h1> }));

describe("Router", () => {
	beforeEach(() => {
		authState.authenticated = true;
		userState.data = { capabilities: ["full-admin"] };
		userState.isLoading = false;
		userState.isError = false;
		completeSSO.mockReset();
		completeSSO.mockResolvedValue(undefined);
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

	it("removes and exchanges a handoff exactly once before rendering login", async () => {
		authState.authenticated = false;
		window.history.replaceState(null, "", "/login?sso_handoff=opaque-secret&next=kept");
		const { rerender } = render(<Router />);
		await waitFor(() => expect(completeSSO).toHaveBeenCalledWith("opaque-secret"));
		expect(window.location.search).toBe("?next=kept");
		rerender(<Router />);
		expect(completeSSO).toHaveBeenCalledOnce();
		expect(await screen.findByRole("heading", { name: "Login" })).toBeVisible();
	});

	it("cleans a rejected or replayed handoff without exposing the code", async () => {
		authState.authenticated = false;
		completeSSO.mockRejectedValue(new Error("replayed"));
		window.history.replaceState(null, "", "/login?sso_handoff=malformed-or-replayed");
		render(<Router />);
		await waitFor(() => expect(window.location.search).toBe("?sso_error=sso_login_denied"));
		expect(window.location.href).not.toContain("malformed-or-replayed");
	});

	it("also consumes an empty malformed handoff parameter", async () => {
		authState.authenticated = false;
		completeSSO.mockRejectedValue(new Error("malformed"));
		window.history.replaceState(null, "", "/login?sso_handoff=");
		render(<Router />);
		await waitFor(() => expect(completeSSO).toHaveBeenCalledWith(""));
		expect(window.location.search).toBe("?sso_error=sso_login_denied");
	});

	it("does not start the authenticated profile or shell before handoff exchange finishes", async () => {
		let finish!: () => void;
		completeSSO.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
		window.history.replaceState(null, "", "/login?sso_handoff=opaque");
		render(<Router />);
		expect(hookOptions.current.enabled).toBe(false);
		expect(screen.getByText("Loading")).toBeVisible();
		expect(screen.queryByTestId("site-menu")).not.toBeInTheDocument();
		await act(async () => finish());
		await waitFor(() => expect(hookOptions.current.enabled).toBe(true));
	});

	it("renders only the waiting branch for a zero-capability user and polls every five seconds", async () => {
		userState.data = { capabilities: [] };
		const { rerender } = render(<Router />);
		expect(await screen.findByRole("heading", { name: "Waiting for access" })).toBeVisible();
		expect(screen.queryByTestId("site-menu")).not.toBeInTheDocument();
		expect(hookOptions.current.refetchInterval({ state: { data: userState.data } })).toBe(5000);

		userState.data = { capabilities: ["hosts.view"] };
		rerender(<Router />);
		expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeVisible();
		expect(screen.getByTestId("site-menu")).toBeVisible();
		expect(hookOptions.current.refetchInterval({ state: { data: userState.data } })).toBe(false);
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
