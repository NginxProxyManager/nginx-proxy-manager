import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	health: { isLoading: false, isError: false, data: { status: "OK", setup: true } as { status: string; setup: boolean } | undefined },
	authenticated: true,
}));
vi.mock("src/hooks", () => ({ useHealth: () => state.health }));
vi.mock("src/context", () => ({ useAuthState: () => ({ authenticated: state.authenticated }) }));
vi.mock("src/components", () => ({
	ErrorNotFound: () => <div>not-found</div>,
	LoadingPage: () => <div>loading</div>,
	Page: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	SiteContainer: ({ children }: { children: ReactNode }) => <main>{children}</main>,
	SiteFooter: () => <footer>footer</footer>,
	SiteHeader: () => <header>header</header>,
	SiteMenu: () => <nav>menu</nav>,
	Unhealthy: () => <div>unhealthy</div>,
}));

vi.mock("src/pages/Setup", () => ({ default: () => <div>setup-page</div> }));
vi.mock("src/pages/Login", () => ({ default: () => <div>login-page</div> }));
vi.mock("src/pages/Dashboard", () => ({ default: () => <div>dashboard-page</div> }));
vi.mock("src/pages/Settings", () => ({ default: () => <div>settings-page</div> }));
vi.mock("src/pages/Certificates", () => ({ default: () => <div>certificates-page</div> }));
vi.mock("src/pages/Access", () => ({ default: () => <div>access-page</div> }));
vi.mock("src/pages/AuditLog", () => ({ default: () => <div>audit-page</div> }));
vi.mock("src/pages/Users", () => ({ default: () => <div>users-page</div> }));
vi.mock("src/pages/Nginx/ProxyHosts", () => ({ default: () => <div>proxy-page</div> }));
vi.mock("src/pages/Nginx/RedirectionHosts", () => ({ default: () => <div>redirection-page</div> }));
vi.mock("src/pages/Nginx/DeadHosts", () => ({ default: () => <div>dead-page</div> }));
vi.mock("src/pages/Nginx/Streams", () => ({ default: () => <div>streams-page</div> }));
vi.mock("src/pages/Nginx/Upstreams", () => ({ default: () => <div>upstreams-page</div> }));

import Router from "./Router";

afterEach(cleanup);

describe("application router", () => {
	it("shows loading and unhealthy states", () => {
		state.health = { isLoading: true, isError: false, data: undefined };
		const view = render(<Router />);
		expect(screen.getByText("loading")).toBeInTheDocument();
		state.health = { isLoading: false, isError: true, data: undefined };
		view.rerender(<Router />);
		expect(screen.getByText("unhealthy")).toBeInTheDocument();
		state.health = { isLoading: false, isError: false, data: { status: "FAILED", setup: true } };
		view.rerender(<Router />);
		expect(screen.getByText("unhealthy")).toBeInTheDocument();
	});

	it("shows setup before authentication", async () => {
		state.health = { isLoading: false, isError: false, data: { status: "OK", setup: false } };
		render(<Router />);
		expect(await screen.findByText("setup-page")).toBeInTheDocument();
	});

	it("shows login for an anonymous configured instance", async () => {
		state.health = { isLoading: false, isError: false, data: { status: "OK", setup: true } };
		state.authenticated = false;
		render(<Router />);
		expect(await screen.findByText("login-page")).toBeInTheDocument();
	});

	it("renders the authenticated application shell and current route", async () => {
		state.health = { isLoading: false, isError: false, data: { status: "OK", setup: true } };
		state.authenticated = true;
		window.history.replaceState({}, "", "/");
		render(<Router />);
		expect(await screen.findByText("dashboard-page")).toBeInTheDocument();
		expect(screen.getByText("header")).toBeInTheDocument();
		expect(screen.getByText("menu")).toBeInTheDocument();
		expect(screen.getByText("footer")).toBeInTheDocument();
	});

	it("loads every authenticated route and the not-found page", async () => {
		state.health = { isLoading: false, isError: false, data: { status: "OK", setup: true } };
		state.authenticated = true;
		for (const [path, text] of [
			["/certificates", "certificates-page"], ["/access", "access-page"], ["/audit-log", "audit-page"],
			["/settings", "settings-page"], ["/users", "users-page"], ["/nginx/proxy", "proxy-page"],
			["/nginx/redirection", "redirection-page"], ["/nginx/404", "dead-page"], ["/nginx/stream", "streams-page"],
			["/nginx/upstreams", "upstreams-page"], ["/missing", "not-found"],
		]) {
			window.history.replaceState({}, "", path);
			const view = render(<Router />);
			expect(await screen.findByText(text)).toBeInTheDocument();
			view.unmount();
		}
	});
});
