import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Login from "./index";

const state = vi.hoisted(() => ({
	mode: "parallel" as "parallel" | "sso_only",
	login: vi.fn(),
	logoutUnconfirmed: false,
}));

vi.mock("@tanstack/react-query", () => ({
	useQuery: () => ({
		data: {
			mode: state.mode,
			passwordLoginAvailable: true,
			connections: [{ id: "corp", name: "Corporate SSO", protocol: "oidc" }],
		},
	}),
}));
vi.mock("src/context", () => ({
	useAuthState: () => ({
		twoFactorChallenge: null,
		login: state.login,
		verifyTwoFactor: vi.fn(),
		cancelTwoFactor: vi.fn(),
		logoutUnconfirmed: state.logoutUnconfirmed,
	}),
}));
vi.mock("src/hooks", () => ({ useHealth: () => ({ data: { version: { major: 2, minor: 0, patch: 0 } } }) }));
vi.mock("src/components", () => ({
	Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
	LocalePicker: () => null,
	Page: ({ children }: any) => <main>{children}</main>,
	ThemeSwitcher: () => null,
}));

describe("Login SSO modes", () => {
	beforeEach(() => {
		state.mode = "parallel";
		state.logoutUnconfirmed = false;
		window.history.replaceState(null, "", "/login");
	});
	afterEach(cleanup);

	it("shows the password form and named providers in parallel mode", () => {
		render(<Login />);
		expect(screen.getByRole("textbox", { name: /email/i })).toBeVisible();
		expect(screen.getByRole("link", { name: "Corporate SSO" })).toBeVisible();
	});

	it("requires an explicit administrator-password choice in SSO-only mode", () => {
		state.mode = "sso_only";
		render(<Login />);
		expect(screen.queryByRole("textbox", { name: /email/i })).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: /administrator password/i }));
		expect(screen.getByRole("textbox", { name: /email/i })).toBeVisible();
		expect(screen.getByRole("link", { name: "Corporate SSO" })).toBeVisible();
	});

	it("surfaces an unconfirmed server logout after local state was cleared", () => {
		state.logoutUnconfirmed = true;
		render(<Login />);
		expect(screen.getByText(/server could not confirm session revocation/i)).toBeVisible();
	});
});
