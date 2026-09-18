import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import Login from "./index";

const oidc = vi.hoisted(() => ({ status: vi.fn(), start: vi.fn(), complete: vi.fn() }));
vi.mock("src/api/backend/oidc", () => ({ getOIDCStatus: oidc.status, startOIDC: oidc.start }));
vi.mock("src/context", () => ({
	useAuthState: () => ({ completeOIDC: oidc.complete, twoFactorChallenge: null }),
}));
vi.mock("src/hooks", () => ({ useHealth: () => ({}) }));
vi.mock("src/locale", () => ({
	T: ({ id }: { id: string }) => id,
	intl: { formatMessage: ({ id }: { id: string }) => id },
}));
vi.mock("src/components", () => ({
	Button: ({ children, fullWidth, color, isLoading, ...props }: any) => <button {...props}>{children}</button>,
	Page: ({ children }: any) => <div>{children}</div>,
	LocalePicker: () => null,
	ThemeSwitcher: () => null,
}));

afterEach(() => {
	cleanup();
	vi.resetAllMocks();
	vi.restoreAllMocks();
	window.history.replaceState(null, "", "/");
});

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

test("a delayed status response cannot start OIDC after local login unmounts the form", async () => {
	const status = deferred<{ enabled: boolean; autoLogin: boolean }>();
	oidc.status.mockReturnValue(status.promise);
	const view = render(<Login />);
	view.unmount();
	await act(async () => status.resolve({ enabled: true, autoLogin: true }));
	expect(oidc.start).not.toHaveBeenCalled();
});

test("a pending OIDC start cannot redirect after local login unmounts the form", async () => {
	const start = deferred<{ url: string }>();
	oidc.status.mockResolvedValue({ enabled: true, autoLogin: false });
	oidc.start.mockReturnValue(start.promise);
	const navigate = vi.spyOn(window.location, "assign").mockImplementation(() => {});
	const view = render(<Login />);
	fireEvent.click(await screen.findByRole("button", { name: "oidc.sign-in" }));
	view.unmount();
	await act(async () => start.resolve({ url: "https://id.example/authorize" }));
	expect(navigate).not.toHaveBeenCalled();
});

test("automatic login still starts once in Strict Mode and uses the returned authorization URL", async () => {
	oidc.status.mockResolvedValue({ enabled: true, autoLogin: true });
	oidc.start.mockResolvedValue({ url: "https://id.example/authorize" });
	const navigate = vi.spyOn(window.location, "assign").mockImplementation(() => {});
	render(
		<StrictMode>
			<Login />
		</StrictMode>,
	);
	await waitFor(() => expect(navigate).toHaveBeenCalledWith("https://id.example/authorize"));
	expect(oidc.start).toHaveBeenCalledTimes(1);
});

test("Strict Mode consumes the callback handoff only once", async () => {
	window.history.replaceState(null, "", "/?oidc=complete");
	oidc.complete.mockResolvedValue(undefined);
	render(
		<StrictMode>
			<Login />
		</StrictMode>,
	);
	await waitFor(() => expect(oidc.complete).toHaveBeenCalledTimes(1));
	expect(oidc.start).not.toHaveBeenCalled();
	expect(oidc.status).not.toHaveBeenCalled();
});

test("local recovery bypasses automatic login while keeping the OIDC button usable", async () => {
	window.history.replaceState(null, "", "/?local=1");
	oidc.status.mockResolvedValue({ enabled: true, autoLogin: true });
	oidc.start.mockResolvedValue({ url: "https://id.example/authorize" });
	const navigate = vi.spyOn(window.location, "assign").mockImplementation(() => {});
	render(<Login />);
	const button = await screen.findByRole("button", { name: "oidc.sign-in" });
	expect(oidc.start).not.toHaveBeenCalled();
	fireEvent.click(button);
	await waitFor(() => expect(navigate).toHaveBeenCalledWith("https://id.example/authorize"));
});
