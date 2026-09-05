import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	twoFactorChallenge: false,
	health: undefined as undefined | { version: { major: number; minor: number; revision: number } },
}));
const login = vi.hoisted(() => vi.fn());
const verifyTwoFactor = vi.hoisted(() => vi.fn());
const cancelTwoFactor = vi.hoisted(() => vi.fn());
const createUser = vi.hoisted(() => vi.fn());
const refetchQueries = vi.hoisted(() => vi.fn());

vi.mock("src/components", () => ({
	Button: ({ children, isLoading: _loading, fullWidth: _full, actionType: _action, color: _color, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; isLoading?: boolean; fullWidth?: boolean; actionType?: string; color?: string }) => <button {...props}>{children}</button>,
	LocalePicker: () => <div>locale-picker</div>,
	Page: ({ children }: { children: ReactNode }) => <main>{children}</main>,
	ThemeSwitcher: () => <div>theme-switcher</div>,
}));
vi.mock("src/context", () => ({
	useAuthState: () => ({ twoFactorChallenge: state.twoFactorChallenge, login, verifyTwoFactor, cancelTwoFactor }),
}));
vi.mock("src/hooks", () => ({ useHealth: () => ({ data: state.health }) }));
vi.mock("src/api/backend", () => ({ createUser }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ refetchQueries }) }));
vi.mock("src/locale", () => ({
	T: ({ id }: { id: string }) => <span>{id}</span>,
	intl: { formatMessage: ({ id }: { id: string }) => id },
}));

import Login from "./Login";
import Setup from "./Setup";

describe("login and initial setup pages", () => {
	afterEach(cleanup);

	beforeEach(() => {
		vi.clearAllMocks();
		state.twoFactorChallenge = false;
		state.health = undefined;
		login.mockResolvedValue(undefined);
		verifyTwoFactor.mockResolvedValue(undefined);
		createUser.mockResolvedValue({ id: 7, email: "owner@example.test" });
		refetchQueries.mockResolvedValue(undefined);
	});

	it("logs in and displays the running version", async () => {
		state.health = { version: { major: 1, minor: 3, revision: 2 } };
		render(<Login />);
		fireEvent.change(screen.getByLabelText("email-address"), { target: { value: "owner@example.test" } });
		fireEvent.change(screen.getByLabelText("password"), { target: { value: "correct-password" } });
		fireEvent.click(screen.getByRole("button", { name: "sign-in" }));
		await waitFor(() => expect(login).toHaveBeenCalledWith("owner@example.test", "correct-password"));
		expect(screen.getByText("v1.3.2")).toBeInTheDocument();
	});

	it("shows login failures", async () => {
		login.mockRejectedValue(new Error("Invalid credentials"));
		render(<Login />);
		fireEvent.change(screen.getByLabelText("email-address"), { target: { value: "owner@example.test" } });
		fireEvent.change(screen.getByLabelText("password"), { target: { value: "wrong-password" } });
		fireEvent.click(screen.getByRole("button", { name: "sign-in" }));
		expect(await screen.findByText("Invalid credentials")).toBeInTheDocument();
	});

	it("verifies and cancels a two-factor challenge", async () => {
		state.twoFactorChallenge = true;
		render(<Login />);
		fireEvent.change(screen.getByLabelText("login.2fa-code"), { target: { value: "123456" } });
		fireEvent.click(screen.getByRole("button", { name: "login.2fa-verify" }));
		await waitFor(() => expect(verifyTwoFactor).toHaveBeenCalledWith("123456"));
		fireEvent.click(screen.getByRole("button", { name: "cancel" }));
		expect(cancelTwoFactor).toHaveBeenCalledOnce();
	});

	it("shows two-factor verification failures", async () => {
		state.twoFactorChallenge = true;
		verifyTwoFactor.mockRejectedValue(new Error("Invalid code"));
		render(<Login />);
		fireEvent.change(screen.getByLabelText("login.2fa-code"), { target: { value: "123456" } });
		fireEvent.click(screen.getByRole("button", { name: "login.2fa-verify" }));
		expect(await screen.findByText("Invalid code")).toBeInTheDocument();
	});

	it("creates the first user, logs in, and refreshes health", async () => {
		render(<Setup />);
		fireEvent.change(screen.getByLabelText("user.full-name"), { target: { value: "Owner Person" } });
		fireEvent.change(screen.getByLabelText("email-address"), { target: { value: "owner@example.test" } });
		fireEvent.change(screen.getByLabelText("user.new-password"), { target: { value: "correct-password" } });
		fireEvent.click(screen.getByRole("button", { name: "save" }));
		await waitFor(() => expect(createUser).toHaveBeenCalled());
		expect(createUser.mock.calls[0][0]).toMatchObject({ name: "Owner Person", nickname: "Owner", email: "owner@example.test" });
		expect(login).toHaveBeenCalledWith("owner@example.test", "correct-password");
		expect(refetchQueries).toHaveBeenCalledWith({ queryKey: ["health"] });
	});

	it("reports initial user creation and follow-up login failures", async () => {
		createUser.mockResolvedValueOnce(null);
		const first = render(<Setup />);
		for (const [label, value] of [["user.full-name", "Owner"], ["email-address", "owner@example.test"], ["user.new-password", "correct-password"]]) {
			fireEvent.change(screen.getByLabelText(label), { target: { value } });
		}
		fireEvent.click(screen.getByRole("button", { name: "save" }));
		expect(await screen.findByText("cannot_create_user")).toBeInTheDocument();
		first.unmount();

		login.mockRejectedValueOnce(new Error("Login failed"));
		render(<Setup />);
		for (const [label, value] of [["user.full-name", "Owner"], ["email-address", "owner@example.test"], ["user.new-password", "correct-password"]]) {
			fireEvent.change(screen.getByLabelText(label), { target: { value } });
		}
		fireEvent.click(screen.getByRole("button", { name: "save" }));
		expect(await screen.findByText("Login failed")).toBeInTheDocument();
	});
});
