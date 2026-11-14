import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import Login from "src/pages/Login/index";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authState } = vi.hoisted(() => ({ authState: { authenticated: false } }));

const fetchMock = vi.fn<typeof fetch>();
const mockNextResponse = (payload: unknown, status = 200) => {
	fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(payload), { status }));
};
beforeEach(() => {
	localStorage.clear();
	vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

vi.mock("src/context", () => ({ useAuthState: () => authState }));
vi.mock("src/hooks", () => ({
	useHealth: () => ({
		data: { status: "OK", setup: true, version: { major: 2, minor: 17 } },
		isLoading: false,
		isError: false,
	}),
}));

vi.mock("src/components", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...(actual as ReactNode[]),
		Page: ({ children }: { children: ReactNode }) => children,
		SiteContainer: ({ children }: { children: ReactNode }) => children,
		LocalePicker: () => <div>LocalePicker</div>,
		ThemeSwitcher: () => <div>ThemeSwitcher</div>,
		SiteHeader: () => null,
		SiteMenu: () => null,
		SiteFooter: () => null,
		LoadingPage: () => <div>Loading</div>,
		Unhealthy: () => <div>Unhealthy</div>,
		ErrorNotFound: () => <h1>Not found</h1>,
	};
});

describe("Login page", () => {
	it("renders a single login button when sso is disabled", async () => {
		mockNextResponse({ enabled: false, configs: [] }); // api/sso/is-enabled
		render(<Login />);
		await vi.dynamicImportSettled();

		expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/sso/is-enabled");

		const title = screen.queryByText<HTMLHeadingElement>("", { selector: "h2" });
		expect(title).toBeVisible();
		expect(title).toHaveTextContent("Login to your account");

		const form = screen.queryByText<HTMLFormElement>("", { selector: "form" });
		expect(form).toBeVisible();

		const buttons = screen.queryAllByText<HTMLButtonElement>("", { selector: "button" });
		expect(buttons.length).toBe(1);
		expect(buttons[0]).toBeVisible();
		expect(buttons[0]).toHaveTextContent("Sign in");
	});

	it("renders a single login button when sso check fails", async () => {
		mockNextResponse({}, 400); // api/sso/is-enabled
		render(<Login />);
		await vi.dynamicImportSettled();

		expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/sso/is-enabled");

		const buttons = screen.queryAllByText<HTMLButtonElement>("", { selector: "button" });
		expect(buttons.length).toBe(1);
		expect(buttons[0]).toBeVisible();
		expect(buttons[0]).toHaveTextContent("Sign in");
	});

	it("renders multiple login buttons when sso is enabled", async () => {
		const name = "Test";
		mockNextResponse({ enabled: true, configs: [{ name, id: 3, type: "OpenID" }] }); // api/sso/is-enabled
		render(<Login />);
		await vi.dynamicImportSettled();

		expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/sso/is-enabled");

		const buttons = screen.getAllByText<HTMLButtonElement>("", { selector: "button" });
		expect(buttons.length).toBe(2);
		expect(buttons[0]).toBeVisible();
		expect(buttons[0]).toHaveTextContent("Sign in");
		expect(buttons[1]).toBeVisible();
		expect(buttons[1]).toHaveTextContent(`Sign in with ${name}`);
	});

	it("renders an sso login button with custom text", async () => {
		const label = "Foo bar";
		mockNextResponse({ enabled: true, configs: [{ name: "Test", id: 3, type: "OpenID", label }] }); // api/sso/is-enabled
		render(<Login />);
		await vi.dynamicImportSettled();

		expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/sso/is-enabled");

		const buttons = screen.getAllByText<HTMLButtonElement>("", { selector: "button" });
		expect(buttons.length).toBe(2);
		expect(buttons[0]).toBeVisible();
		expect(buttons[0]).toHaveTextContent("Sign in");
		expect(buttons[1]).toBeVisible();
		expect(buttons[1]).toHaveTextContent(label);
	});

	it.each([
		[1, "OpenID"],
		[2, "Auth0"],
		[3, "GitHub"],
	])("renders an sso login button which redirects via location replace when clicked", async (id, type) => {
		const mockReplace = vi.spyOn(window.location, "replace").mockImplementation(() => {});
		mockNextResponse({ enabled: true, configs: [{ name: "Test", id, type }] }); // api/sso/is-enabled
		render(<Login />);
		await vi.dynamicImportSettled();

		expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/sso/is-enabled");

		const buttons = screen.getAllByText<HTMLButtonElement>("", { selector: "button" });
		expect(buttons.length).toBe(2);

		buttons[1].click();

		expect(mockReplace).toHaveBeenCalledExactlyOnceWith(`/api/sso/oauth2/${type.toLocaleLowerCase()}/${id}`);
	});

	it.each([
		[1, [0, 2]],
		[2, [0, 1]],
	])("other login buttons become disabled when one is clicked", async (clickedBtnIndex, notClickedBtnIndices) => {
		vi.spyOn(window.location, "replace").mockImplementation(() => {});
		mockNextResponse({
			enabled: true,
			configs: [
				{ name: "Test", id: 1, type: "OpenID" },
				{ name: "Test2", id: 2, type: "Auth0" },
			],
		}); // api/sso/is-enabled
		render(<Login />);
		await vi.dynamicImportSettled();

		expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/sso/is-enabled");

		const buttons = screen.getAllByText<HTMLButtonElement>("", { selector: "button" });
		expect(buttons.length).toBe(3);

		buttons.find((_, idx) => idx === clickedBtnIndex)?.click();
		await vi.dynamicImportSettled();

		expect(buttons.find((_, idx) => idx === clickedBtnIndex)).not.toBeDisabled();
		expect(buttons.find((_, idx) => idx === clickedBtnIndex)).toHaveClass("btn-loading");

		notClickedBtnIndices.forEach((idx) => {
			expect(buttons.find((_, i) => i === idx)).toBeDisabled();
		});
	});

	it("renders an error message from cookie then cookie is removed", async () => {
		window.cookieStore.set({
			name: "npm_sso_error",
			value: "foo-error",
			expires: Date.now() + 86400,
			path: "/",
		});
		mockNextResponse({ enabled: true, configs: [{ name: "Test", id: 3, type: "OpenID" }] }); // api/sso/is-enabled
		render(<Login />);
		await vi.dynamicImportSettled();

		expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/sso/is-enabled");

		const formErr = await screen.findByRole<HTMLDivElement>("alert");
		expect(formErr).toBeVisible();
		expect(formErr).toHaveTextContent("foo-error");
		expect(document.cookie).not.toContain("npm_sso_error");
	});
});
