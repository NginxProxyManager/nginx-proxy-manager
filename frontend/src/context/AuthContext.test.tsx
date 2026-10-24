import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuthState } from "./AuthContext";
import AuthStore, { TOKEN_KEY } from "src/modules/AuthStore";

const api = vi.hoisted(() => ({
	exchange: vi.fn(),
	logout: vi.fn(),
	refresh: vi.fn(),
	login: vi.fn(),
	impersonate: vi.fn(),
	verify: vi.fn(),
	intervals: [] as Array<() => void>,
}));

vi.mock("rooks", () => ({ useIntervalWhen: (callback: () => void) => { api.intervals.push(callback); } }));
vi.mock("src/api/backend", async (load) => {
	const actual = await load<typeof import("src/api/backend")>();
	return {
		...actual,
		exchangeSSOHandoff: api.exchange,
		logoutSession: api.logout,
		refreshToken: api.refresh,
		getToken: api.login,
		loginAsUser: api.impersonate,
		verify2FA: api.verify,
	};
});

function Probe() {
	const auth = useAuthState();
	return <div>
		<span>{auth.authenticated ? "authenticated" : "signed-out"}</span>
		<span>{auth.logoutUnconfirmed ? "logout-unconfirmed" : "logout-confirmed"}</span>
		<span>{auth.twoFactorChallenge ? "challenge-pending" : "no-challenge"}</span>
		<button type="button" onClick={() => void auth.login("local", "account-a", "secret")}>login</button>
		<button type="button" onClick={() => void auth.loginAs(2)}>impersonate</button>
		<button type="button" onClick={() => void auth.verifyTwoFactor("123456")}>verify</button>
		<button type="button" onClick={() => void auth.completeSSO("handoff-code")}>complete</button>
		<button type="button" onClick={() => void auth.logout().catch(() => undefined)}>logout</button>
	</div>;
}

function AccountSwitchProbe() {
	const auth = useAuthState();
	const client = useQueryClient();
	const [result, setResult] = useState("waiting");
	return <div>
		<button type="button" onClick={async () => {
			await auth.completeSSO("account-b-handoff");
			setResult(
				client.getQueryData(["user", "me"]) === undefined &&
				client.getQueryData(["protected"]) === undefined
					? "account-b-needs-refetch"
					: "stale-account-a-cache",
			);
		}}>switch account</button>
		<span>{result}</span>
	</div>;
}

const token = (value: string) => ({ token: value, expires: Math.floor(Date.now() / 1000) + 3600 });
const renderAuth = (children = <Probe />) => {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	client.setQueryData(["protected"], { secret: true });
	return { client, ...render(<QueryClientProvider client={client}><AuthProvider>{children}</AuthProvider></QueryClientProvider>) };
};

describe("AuthProvider SSO and session lifecycle", () => {
	beforeEach(() => {
		localStorage.clear();
		api.exchange.mockReset();
		api.logout.mockReset();
		api.refresh.mockReset();
		api.login.mockReset();
		api.impersonate.mockReset();
		api.verify.mockReset();
		api.intervals.length = 0;
	});
	afterEach(cleanup);

	it("stores an SSO exchange in the existing token stack without a 2FA challenge", async () => {
		const exchanged = token("sso-token");
		api.exchange.mockResolvedValue(exchanged);
		renderAuth();
		fireEvent.click(screen.getByText("complete"));
		await screen.findByText("authenticated");
		expect(api.exchange).toHaveBeenCalledOnce();
		expect(JSON.parse(localStorage.getItem(TOKEN_KEY) || "[]")).toEqual([exchanged]);
	});

	it("clears account A profile and protected cache before completing an SSO switch to account B", async () => {
		localStorage.setItem(TOKEN_KEY, JSON.stringify([token("account-a")]));
		api.exchange.mockResolvedValue(token("account-b"));
		const { client } = renderAuth(<AccountSwitchProbe />);
		client.setQueryData(["user", "me"], { id: 1, name: "Account A" });
		fireEvent.click(screen.getByRole("button", { name: /switch account/i }));
		expect(await screen.findByText("account-b-needs-refetch")).toBeVisible();
		expect(JSON.parse(localStorage.getItem(TOKEN_KEY) || "[]")[0].token).toBe("account-b");
	});

	it("clears account-scoped cache after a successful local credential change", async () => {
		AuthStore.set(token("account-a"));
		api.login.mockResolvedValue(token("account-b"));
		const { client } = renderAuth();
		client.setQueryData(["user", "me"], { id: 1 });
		fireEvent.click(screen.getByText("login"));
		await waitFor(() => expect(AuthStore.token?.token).toBe("account-b"));
		expect(client.getQueryData(["user", "me"])).toBeUndefined();
		expect(client.getQueryData(["protected"])).toBeUndefined();
	});

	it("clears local auth and the real query cache when server logout is unconfirmed", async () => {
		localStorage.setItem(TOKEN_KEY, JSON.stringify([token("live")]));
		api.logout.mockRejectedValue(new TypeError("offline"));
		const { client } = renderAuth();
		fireEvent.click(screen.getByText("logout"));
		await screen.findByText("signed-out");
		expect(screen.getByText("logout-unconfirmed")).toBeVisible();
		expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
		expect(client.getQueryData(["protected"])).toBeUndefined();
	});

	it("revokes only the impersonation child and restores the parent token", async () => {
		const parent = token("parent");
		localStorage.setItem(TOKEN_KEY, JSON.stringify([parent, token("child")]));
		api.logout.mockResolvedValue(undefined);
		renderAuth();
		fireEvent.click(screen.getByText("logout"));
		await waitFor(() => expect(api.logout).toHaveBeenCalledOnce());
		expect(JSON.parse(localStorage.getItem(TOKEN_KEY) || "[]")).toEqual([parent]);
		expect(screen.getByText("authenticated")).toBeVisible();
	});

	it("synchronizes a logout from another tab", async () => {
		localStorage.setItem(TOKEN_KEY, JSON.stringify([token("live")]));
		const { client } = renderAuth();
		localStorage.removeItem(TOKEN_KEY);
		act(() => window.dispatchEvent(new StorageEvent("storage", { key: TOKEN_KEY, oldValue: "token", newValue: null })));
		await screen.findByText("signed-out");
		expect(client.getQueryData(["protected"])).toBeUndefined();
	});

	it.each(["sso", "logout", "impersonation", "storage", "return-to-parent", "storage-same-token"])("ignores refresh completion after %s changes the active authentication", async (transition) => {
		AuthStore.set(token("account-a"));
		let finish!: (value: ReturnType<typeof token>) => void;
		api.refresh.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
		api.exchange.mockResolvedValue(token("account-b"));
		api.logout.mockResolvedValue(undefined);
		renderAuth();
		act(() => api.intervals[api.intervals.length - 1]?.());
		expect(api.refresh).toHaveBeenCalledOnce();
		if (transition === "sso") {
			fireEvent.click(screen.getByText("complete"));
			await waitFor(() => expect(AuthStore.token?.token).toBe("account-b"));
		} else if (transition === "logout") {
			fireEvent.click(screen.getByText("logout"));
			await screen.findByText("signed-out");
		} else if (transition === "impersonation") {
			AuthStore.add(token("child"));
		} else if (transition === "return-to-parent") {
			AuthStore.add(token("child"));
			AuthStore.drop();
		} else if (transition === "storage-same-token") {
			act(() => window.dispatchEvent(new StorageEvent("storage", { key: TOKEN_KEY })));
		} else {
			localStorage.setItem(TOKEN_KEY, JSON.stringify([token("account-b")]));
			act(() => window.dispatchEvent(new StorageEvent("storage", { key: TOKEN_KEY })));
		}
		const expected = localStorage.getItem(TOKEN_KEY);
		await act(async () => { finish(token("refreshed-a")); });
		expect(localStorage.getItem(TOKEN_KEY)).toBe(expected);
		if (transition === "logout") expect(screen.getByText("signed-out")).toBeVisible();
	});

	it("applies a refresh for the unchanged active session while preserving its parent", async () => {
		AuthStore.set(token("parent"));
		AuthStore.add(token("child"));
		api.refresh.mockResolvedValue(token("refreshed-child"));
		renderAuth();
		await act(async () => api.intervals[api.intervals.length - 1]?.());
		expect(AuthStore.tokens.map((value: { token: string }) => value.token)).toEqual(["parent", "refreshed-child"]);
	});

	it("does not clear account B when account A's outstanding logout finishes", async () => {
		AuthStore.set(token("account-a"));
		let finish!: () => void;
		api.logout.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
		api.exchange.mockResolvedValue(token("account-b"));
		renderAuth();
		fireEvent.click(screen.getByText("logout"));
		fireEvent.click(screen.getByText("complete"));
		await waitFor(() => expect(AuthStore.token?.token).toBe("account-b"));
		await act(async () => finish());
		expect(AuthStore.token?.token).toBe("account-b");
		expect(screen.getByText("authenticated")).toBeVisible();
	});

	it.each(["login", "impersonate", "verify", "complete"])("ignores outstanding %s completion after another tab switches accounts", async (operation) => {
		AuthStore.set(token("account-a"));
		let finish!: (value: ReturnType<typeof token>) => void;
		const pending = new Promise((resolve) => { finish = resolve; });
		api.login.mockReturnValue(pending);
		api.impersonate.mockReturnValue(pending);
		api.verify.mockReturnValue(pending);
		api.exchange.mockReturnValue(pending);
		const { client } = renderAuth();
		if (operation === "verify") {
			api.login.mockResolvedValue({ requires2fa: true, challengeToken: "challenge-a" });
			fireEvent.click(screen.getByText("login"));
			await screen.findByText("challenge-pending");
		}
		fireEvent.click(screen.getByText(operation));
		AuthStore.set(token("account-b"));
		act(() => window.dispatchEvent(new StorageEvent("storage", { key: TOKEN_KEY })));
		client.setQueryData(["user", "me"], { id: 2 });
		await act(async () => finish(token("old-account-a-response")));
		expect(AuthStore.token?.token).toBe("account-b");
		expect(client.getQueryData(["user", "me"])).toEqual({ id: 2 });
	});
});
