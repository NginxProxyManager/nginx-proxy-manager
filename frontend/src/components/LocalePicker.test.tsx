import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const setLocale = vi.hoisted(() => vi.fn());
const changeLocale = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({ theme: "light" }));
vi.mock("src/components", () => ({ Flag: ({ countryCode }: { countryCode: string }) => <span>{`flag-${countryCode}`}</span> }));
vi.mock("src/context", () => ({ useLocaleState: () => ({ locale: "en", setLocale }) }));
vi.mock("src/hooks", () => ({ useTheme: () => ({ getTheme: () => state.theme }) }));
vi.mock("src/locale", () => ({
	changeLocale,
	getFlagCodeForLocale: (locale: string) => locale.toUpperCase(),
	localeOptions: [["en", "english"], ["zh-CN", "chinese"]],
	T: ({ id }: { id: string }) => <span>{id}</span>,
}));

import { LocalePicker } from "./LocalePicker";

afterEach(cleanup);

describe("locale picker", () => {
	it("renders locale choices, alignment, and current theme", () => {
		const view = render(<LocalePicker menuAlign="end" />);
		expect(screen.getAllByText("flag-EN")).toHaveLength(2);
		expect(screen.getByText("locale-english")).toBeInTheDocument();
		expect(screen.getByText("locale-chinese")).toBeInTheDocument();
		expect(view.container.querySelector(".dropdown-menu-end")).toBeInTheDocument();
		expect(view.container.querySelector(".btn-ghost-light")).toBeInTheDocument();
		state.theme = "dark";
		view.rerender(<LocalePicker />);
		expect(view.container.querySelector(".btn-ghost-dark")).toBeInTheDocument();
	});

	it("persists a selected locale before reloading", () => {
		render(<LocalePicker />);
		fireEvent.click(screen.getByText("locale-chinese").closest("a") as HTMLElement);
		expect(changeLocale).toHaveBeenCalledWith("zh-CN");
		expect(setLocale).toHaveBeenCalledWith("zh-CN");
	});
});
