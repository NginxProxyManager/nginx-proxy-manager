import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { type AuthContextType, AuthProvider, useAuthState } from "./AuthContext";

const mocks = vi.hoisted(() => ({ exchange: vi.fn(), setToken: vi.fn(), localLogin: vi.fn() }));
vi.mock("src/api/backend/oidc", () => ({ exchangeOIDC: mocks.exchange }));
vi.mock("src/api/backend", () => ({
	getToken: mocks.localLogin,
	isTwoFactorChallenge: (value: any) => value.requires2fa === true,
}));
vi.mock("src/modules/AuthStore", () => ({ default: { hasActiveToken: () => false, set: mocks.setToken } }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ clear: () => {} }) }));
vi.mock("rooks", () => ({ useIntervalWhen: () => {} }));

afterEach(() => {
	cleanup();
	vi.resetAllMocks();
});

test("an abandoned OIDC exchange cannot overwrite a completed local login", async () => {
	let finish!: (value: unknown) => void;
	mocks.exchange.mockReturnValue(
		new Promise((resolve) => {
			finish = resolve;
		}),
	);
	const localToken = { token: "local-session", expires: "later" };
	mocks.localLogin.mockResolvedValue(localToken);
	let auth!: AuthContextType;
	function Consumer() {
		auth = useAuthState();
		return null;
	}
	render(
		<AuthProvider>
			<Consumer />
		</AuthProvider>,
	);
	const controller = new AbortController();
	const pending = auth.completeOIDC(controller.signal);
	await act(async () => auth.login("local@example.com", "local-password"));
	controller.abort();
	await act(async () => {
		finish({ token: "late-oidc-session", expires: "later" });
		await pending;
	});
	expect(mocks.setToken).toHaveBeenCalledTimes(1);
	expect(mocks.setToken).toHaveBeenCalledWith(localToken);
});
