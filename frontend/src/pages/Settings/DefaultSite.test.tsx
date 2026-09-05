import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ButtonHTMLAttributes, ComponentProps, PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	result: { data: { value: "congratulations", meta: { redirect: "", html: "" } }, isLoading: false, error: null } as any,
	setSetting: vi.fn(), success: vi.fn(),
}));
vi.mock("src/hooks", () => ({ useSetting: () => mocks.result, useSetSetting: () => ({ mutate: mocks.setSetting }) }));
vi.mock("src/notifications", () => ({ showObjectSuccess: (...args: any[]) => mocks.success(...args) }));
vi.mock("src/locale", () => ({ intl: { formatMessage: ({ id }: { id: string }) => id }, T: ({ id }: { id: string }) => <>{id}</> }));
vi.mock("src/components", () => ({
	Button: ({ children, actionType: _actionType, isLoading: _isLoading, ...props }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & any>) => <button {...props}>{children}</button>,
	Loading: () => <div>loading</div>, HasPermission: ({ children }: PropsWithChildren) => <>{children}</>,
}));
vi.mock("@uiw/react-textarea-code-editor", () => ({ default: ({ minHeight: _minHeight, indentWidth: _indentWidth, ...props }: ComponentProps<"textarea"> & any) => <textarea {...props} /> }));

import DefaultSite from "./DefaultSite";
import Layout from "./Layout";
import Settings from ".";

afterEach(cleanup);
beforeEach(() => {
	vi.clearAllMocks();
	mocks.result = { data: { value: "congratulations", meta: { redirect: "", html: "" } }, isLoading: false, error: null };
	mocks.setSetting.mockImplementation((_payload, options) => { options.onSuccess(); options.onSettled(); });
});

describe("default site settings", () => {
	it("switches redirect and HTML modes and saves the selected configuration", async () => {
		const { rerender } = render(<DefaultSite />);
		fireEvent.click(screen.getByRole("radio", { name: "settings.default-site.redirect" }));
		fireEvent.change(screen.getByRole("textbox"), { target: { value: "https://example.test" } });
		fireEvent.click(screen.getByRole("button", { name: "save" }));
		await waitFor(() => expect(mocks.setSetting).toHaveBeenCalledWith(expect.objectContaining({ value: "redirect", meta: expect.objectContaining({ redirect: "https://example.test" }) }), expect.any(Object)));

		rerender(<DefaultSite />);
		fireEvent.click(screen.getByRole("radio", { name: "settings.default-site.html" }));
		fireEvent.change(screen.getByRole("textbox"), { target: { value: "<h1>Hello</h1>" } });
		expect(screen.getAllByText("settings.default-site.html")).toHaveLength(2);
	});

	it("renders loading, errors, the layout navigation, and permission wrapper", () => {
		mocks.result = { data: undefined, isLoading: true, error: null };
		const { rerender } = render(<DefaultSite />);
		expect(screen.getByText("loading")).toBeInTheDocument();
		mocks.result = { data: undefined, isLoading: false, error: new Error("settings unavailable") };
		rerender(<DefaultSite />);
		expect(screen.getByText("settings unavailable")).toBeInTheDocument();

		mocks.result = { data: { value: "404", meta: {} }, isLoading: false, error: null };
		rerender(<Layout />);
		fireEvent.click(screen.getByRole("link", { name: "settings.default-site" }));
		rerender(<Settings />);
		expect(screen.getByText("settings")).toBeInTheDocument();
	});
});
