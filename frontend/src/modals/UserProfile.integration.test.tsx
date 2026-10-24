import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RawIntlProvider } from "react-intl";
import { afterEach, expect, it, vi } from "vitest";
import { createIntl } from "src/locale";
import AuthStore from "src/modules/AuthStore";
import { UserEditor } from "./UserModal";

vi.mock("src/notifications", () => ({ showObjectSuccess: vi.fn() }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); AuthStore.clear(); });

it("submits an SSO user's self profile through PUT users/me with no policy or credential fields", async () => {
	const account = { id: 2, name: "SSO User", email: "sso@example.com", capabilities: ["hosts.view"], hasLocalCredential: false, canSetLocalPassword: false, passwordLoginEnabled: false };
	AuthStore.set({ token: "sso-session", expires: 9999999999 });
	const requests: Array<{ url: string; method: string; body: any }> = [];
	vi.stubGlobal("fetch", vi.fn(async (url: string, options: RequestInit = {}) => {
		const method = options.method || "GET";
		const body = options.body ? JSON.parse(options.body as string) : undefined;
		requests.push({ url, method, body });
		if (url === "/api/users/me" && method === "PUT") Object.assign(account, body);
		if ((url === "/api/users/me" || url === "/api/users/2") && (method === "GET" || method === "PUT")) {
			return { ok: true, status: 200, json: async () => ({ result: { ...account } }) };
		}
		return { ok: false, status: 400, json: async () => ({ error: { message: "Unexpected profile route" } }) };
	}));
	const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
	const remove = vi.fn();
	const intl = createIntl({ locale: "en" });
	const view = render(<QueryClientProvider client={client}><RawIntlProvider value={intl}><UserEditor {...({ id: "me", visible: true, remove } as any)} /></RawIntlProvider></QueryClientProvider>);
	const name = await screen.findByLabelText(/full name/i);
	fireEvent.change(name, { target: { value: "Renamed SSO User" } });
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	await waitFor(() => expect(requests.find(({ method }) => method !== "GET")).toEqual({
		url: "/api/users/me", method: "PUT", body: { name: "Renamed SSO User", email: "sso@example.com" },
	}));
	await waitFor(() => expect(remove).toHaveBeenCalled());
	expect(screen.queryByLabelText(/administrator password login/i)).not.toBeInTheDocument();
	view.unmount();
	client.clear();
});
