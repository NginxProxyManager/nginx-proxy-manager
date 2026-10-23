import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuthState } from "./AuthContext";
import { TOKEN_KEY } from "src/modules/AuthStore";

const api = vi.hoisted(() => ({
	exchange: vi.fn(),
	logout: vi.fn(),
	refresh: vi.fn(),
}));

vi.mock("rooks", () => ({ useIntervalWhen: vi.fn() }));
vi.mock("src/api/backend", async (load) => {
	const actual = await load<typeof import("src/api/backend")>();
	return {
		...actual,
		exchangeSSOHandoff: api.exchange,
		logoutSession: api.logout,
		refreshToken: api.refresh,
	};
});

function Probe() {
	const auth = useAuthState();
	return <div>
		<span>{auth.authenticated ? "authenticated" : "signed-out"}</span>
		<span>{auth.logoutUnconfirmed ? "logout-unconfirmed" : "logout-confirmed"}</span>
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
});
