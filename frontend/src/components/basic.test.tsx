import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.hoisted(() => vi.fn());
const setTheme = vi.hoisted(() => vi.fn());
const hookState = vi.hoisted(() => ({
	health: { data: undefined as undefined | { version: { major: number; minor: number; revision: number } } },
	version: { data: undefined as undefined | { updateAvailable: boolean; latest: string } },
}));

vi.mock("react-router-dom", async (loadOriginal) => ({
	...(await loadOriginal<typeof import("react-router-dom")>()),
	useNavigate: () => navigate,
}));
vi.mock("src/hooks", () => ({
	useHealth: () => hookState.health,
	useCheckVersion: () => hookState.version,
	useTheme: () => ({ setTheme }),
}));
vi.mock("src/locale", () => ({
	T: ({ id }: { id: string }) => <span>{id}</span>,
}));

import { Button } from "./Button";
import { ErrorNotFound } from "./ErrorNotFound";
import { Flag } from "./Flag";
import { Loading } from "./Loading";
import { LoadingPage } from "./LoadingPage";
import { NavLink } from "./NavLink";
import { Page } from "./Page";
import { SiteFooter } from "./SiteFooter";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { Unhealthy } from "./Unhealthy";

describe("basic components", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		hookState.health.data = undefined;
		hookState.version.data = undefined;
	});

	it("renders button variants and suppresses actions while loading", () => {
		const onClick = vi.fn();
		const { rerender } = render(
			<Button actionType="primary" variant="pill" size="lg" color="green" fullWidth onClick={onClick}>
				Save
			</Button>,
		);
		const button = screen.getByRole("button", { name: "Save" });
		expect(button.className).toContain("btn-primary");
		expect(button.className).toContain("btn-pill");
		fireEvent.click(button);
		expect(onClick).toHaveBeenCalledOnce();

		rerender(<Button isLoading onClick={onClick}>Save</Button>);
		fireEvent.click(screen.getByRole("button", { name: "Save" }));
		expect(onClick).toHaveBeenCalledOnce();
	});

	it("navigates through links and not-found actions", () => {
		const onClick = vi.fn();
		render(<NavLink to="/settings" onClick={onClick} isDropdownItem>Settings</NavLink>);
		fireEvent.click(screen.getByText("Settings"));
		expect(onClick).toHaveBeenCalledOnce();
		expect(navigate).toHaveBeenCalledWith("/settings");

		render(<ErrorNotFound />);
		fireEvent.click(screen.getByRole("button", { name: "notfound.action" }));
		expect(navigate).toHaveBeenCalledWith("/");
	});

	it("renders loading, page, health, and flag states", () => {
		const { rerender } = render(<Loading label="Waiting" />);
		expect(screen.getByText("Waiting")).toBeInTheDocument();
		expect(document.querySelector("img")).toBeInTheDocument();
		rerender(<Loading noLogo />);
		expect(screen.getByText("loading")).toBeInTheDocument();

		render(<LoadingPage label="Page wait" noLogo />);
		render(<Page className="custom">Content</Page>);
		render(<Unhealthy />);
		expect(screen.getByText("The API is not healthy.")).toBeInTheDocument();

		const flags = render(<Flag countryCode="en" />);
		expect(flags.container.querySelector("svg")).toBeInTheDocument();
		flags.rerender(<Flag countryCode="us" />);
		expect(screen.getByTitle("US")).toBeInTheDocument();
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
		flags.rerender(<Flag countryCode="zz" />);
		expect(consoleError).toHaveBeenCalled();
		consoleError.mockRestore();
	});

	it("switches themes from both controls", () => {
		render(<ThemeSwitcher />);
		const buttons = screen.getAllByRole("button", { name: "Enable dark mode" });
		fireEvent.click(buttons[0]);
		fireEvent.click(buttons[1]);
		expect(setTheme.mock.calls).toEqual([["dark"], ["light"]]);
	});

	it("links the running and latest fork versions", () => {
		const { rerender } = render(<SiteFooter />);
		expect(document.querySelector('a[href*="tags?name="]')?.getAttribute("href")).toContain("name=");

		hookState.health.data = { version: { major: 1, minor: 3, revision: 2 } };
		hookState.version.data = { updateAvailable: true, latest: "v1.4.0" };
		rerender(<SiteFooter />);
		expect(screen.getByText("v1.3.2")).toBeInTheDocument();
		expect(screen.getByText("update-available").closest("a")?.getAttribute("href")).toContain("name=1.4.0");
	});
});
