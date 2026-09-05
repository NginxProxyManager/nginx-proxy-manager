import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ user: { nickname: "Owner", avatar: "", roles: ["admin"] } }));
const actions = vi.hoisted(() => ({
	logout: vi.fn(),
	showUserModal: vi.fn(),
	showChangePasswordModal: vi.fn(),
	showTwoFactorModal: vi.fn(),
}));
vi.mock("src/hooks", () => ({ useUser: () => ({ data: state.user }) }));
vi.mock("src/context", () => ({ useAuthState: () => ({ logout: actions.logout }) }));
vi.mock("src/locale", () => ({ T: ({ id }: { id: string }) => <span>{id}</span> }));
vi.mock("src/modals", () => ({
	showUserModal: actions.showUserModal,
	showChangePasswordModal: actions.showChangePasswordModal,
	showTwoFactorModal: actions.showTwoFactorModal,
}));
vi.mock("src/components", () => ({
	HasPermission: ({ children }: { children: ReactNode }) => <>{children}</>,
	LocalePicker: () => <div>locale</div>,
	ThemeSwitcher: () => <div>theme</div>,
	NavLink: ({ children, to, onClick, isDropdownItem }: { children: ReactNode; to?: string; onClick?: () => void; isDropdownItem?: boolean }) => (
		<a href={to} data-dropdown={isDropdownItem} onClick={(event) => { event.preventDefault(); onClick?.(); }}>{children}</a>
	),
}));

import { SiteHeader } from "./SiteHeader";
import { SiteMenu } from "./SiteMenu";

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe("site navigation", () => {
	beforeEach(() => vi.clearAllMocks());

	it("renders the current admin and invokes every account action", () => {
		const view = render(<SiteHeader />);
		expect(screen.getAllByText("Owner").length).toBeGreaterThan(0);
		expect(screen.getAllByText("role.admin").length).toBeGreaterThan(0);
		expect(view.container.querySelector(".avatar")?.getAttribute("style")).toContain("default-avatar");
		fireEvent.click(screen.getByText("user.edit-profile").closest("a") as HTMLElement);
		fireEvent.click(screen.getByText("user.change-password").closest("a") as HTMLElement);
		fireEvent.click(screen.getByText("user.two-factor").closest("a") as HTMLElement);
		fireEvent.click(screen.getByText("user.logout").closest("a") as HTMLElement);
		expect(actions.showUserModal).toHaveBeenCalledWith("me");
		expect(actions.showChangePasswordModal).toHaveBeenCalledWith("me");
		expect(actions.showTwoFactorModal).toHaveBeenCalledWith("me");
		expect(actions.logout).toHaveBeenCalledOnce();

		state.user = { nickname: "Person", avatar: "avatar.png", roles: [] };
		view.rerender(<SiteHeader />);
		expect(screen.getAllByText("role.standard-user").length).toBeGreaterThan(0);
	});

	it("renders all top-level and host submenu destinations", () => {
		render(<SiteMenu />);
		for (const label of ["dashboard", "hosts", "proxy-hosts", "redirection-hosts", "streams", "upstreams", "dead-hosts", "access-lists", "certificates", "users", "auditlogs", "settings"]) {
			expect(screen.getByText(label)).toBeInTheDocument();
		}
		expect(document.querySelectorAll("a[data-dropdown='true']").length).toBe(5);
	});

	it("collapses an open mobile menu after navigation", () => {
		vi.useFakeTimers();
		const toggler = document.createElement("button");
		toggler.className = "navbar-toggler";
		const click = vi.spyOn(toggler, "click");
		document.body.append(toggler);
		render(<SiteMenu />);
		document.querySelector("#navbar-menu")?.classList.add("show");
		fireEvent.click(screen.getByText("dashboard").closest("a") as HTMLElement);
		vi.advanceTimersByTime(300);
		expect(click).toHaveBeenCalledOnce();
	});
});
