import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RawIntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createIntl } from "src/locale";
import { SiteHeader } from "./SiteHeader";

const state = vi.hoisted(() => ({ hasLocalCredential: false, edit: vi.fn(), password: vi.fn() }));
vi.mock("src/hooks", () => ({ useUser: () => ({ data: { id: 2, name: "SSO User", gravatarUrl: "", capabilities: ["hosts.view"], hasLocalCredential: state.hasLocalCredential } }) }));
vi.mock("src/context", () => ({ useAuthState: () => ({ logout: vi.fn() }) }));
vi.mock("src/modals", () => ({ showUserModal: state.edit, showChangePasswordModal: state.password, showTwoFactorModal: vi.fn() }));
vi.mock("src/components", () => ({ LocalePicker: () => null, ThemeSwitcher: () => null, NavLink: ({ children }: any) => <a href="/">{children}</a> }));
const intl = createIntl({ locale: "en", messages: { "role.standard-user": "Standard user", "role.admin": "Administrator", "user.edit-profile": "Edit profile", "user.change-password": "Change password", "user.two-factor": "Two-factor", "user.logout": "Logout" } });
function renderHeader() { return render(<RawIntlProvider value={intl}><SiteHeader /></RawIntlProvider>); }

describe("SiteHeader credential actions", () => {
	beforeEach(() => { state.hasLocalCredential = false; state.edit.mockReset(); state.password.mockReset(); });
	afterEach(cleanup);
	it("keeps profile editing for SSO users while hiding only password change", () => {
		renderHeader();
		fireEvent.click(screen.getByText(/edit profile/i));
		expect(state.edit).toHaveBeenCalledWith("me");
		expect(screen.queryByText(/change password/i)).not.toBeInTheDocument();
	});
	it("shows password change when a local credential exists", () => {
		state.hasLocalCredential = true;
		renderHeader();
		expect(screen.getByText(/edit profile/i)).toBeVisible();
		expect(screen.getByText(/change password/i)).toBeVisible();
	});
});
