import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import NginxConfig from "./NginxConfig";

vi.mock("src/context", () => ({ useLocaleState: () => ({ locale: "en" }) }));

const api = vi.hoisted(() => ({
	regenerateNginxConfigs: vi.fn(),
}));
vi.mock("src/api/backend", async (importOriginal) => ({
	...(await importOriginal<typeof import("src/api/backend")>()),
	...api,
}));

const modals = vi.hoisted(() => ({
	showProxyHostModal: vi.fn(),
	showRedirectionHostModal: vi.fn(),
	showDeadHostModal: vi.fn(),
	showStreamModal: vi.fn(),
}));
vi.mock("src/modals", () => modals);

const renderPage = (queryClient = new QueryClient()) => {
	const invalidate = vi.spyOn(queryClient, "invalidateQueries");
	const utils = render(
		<QueryClientProvider client={queryClient}>
			<NginxConfig />
		</QueryClientProvider>,
	);
	return { ...utils, invalidate, queryClient };
};

const confirm = async () => {
	fireEvent.click(screen.getByRole("button", { name: /Regenerate all host configs/ }));
	await screen.findByText("Regenerate all host configs?");
	fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
};

describe("Settings: Nginx configuration", () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("asks before regenerating and does nothing on cancel", async () => {
		renderPage();
		fireEvent.click(screen.getByRole("button", { name: /Regenerate all host configs/ }));
		expect(await screen.findByText(/Working hosts stay online, there is no downtime/)).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		await waitFor(() => expect(screen.queryByText("Regenerate all host configs?")).toBeNull());
		expect(api.regenerateNginxConfigs).not.toHaveBeenCalled();
	});

	it("shows a spinner while running, then the counts, offline hosts and warnings", async () => {
		let resolve: (value: unknown) => void = () => {};
		api.regenerateNginxConfigs.mockReturnValue(new Promise((r) => (resolve = r)));
		const { invalidate } = renderPage();
		await confirm();

		expect(await screen.findByTestId("regenerate-running")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Regenerate all host configs/ })).toBeDisabled();

		await act(async () => {
			resolve({
				checked: 4,
				regenerated: 2,
				offline: [{ hostType: "proxy_host", id: 7, name: "broken.example.com", error: "unknown directive" }],
				failed: [{ hostType: "stream", id: 3, name: "2222", error: "certificate missing" }],
				warnings: [
					{ hostType: "proxy_host", id: 9, name: "app.example.com", message: "/api: does not resolve" },
				],
				durationMs: 2345,
			});
		});

		const result = await screen.findByTestId("regenerate-result");
		expect(result).toHaveTextContent("Checked 4 hosts in 2.3 s: 2 online, 1 offline, 1 not regenerated.");
		expect(screen.getByTestId("regenerate-offline")).toHaveTextContent("1 host is offline now");
		expect(screen.getByTestId("regenerate-offline")).toHaveTextContent("unknown directive");
		expect(screen.getByTestId("regenerate-failed")).toHaveTextContent("keeps its previous config");
		expect(screen.getByTestId("regenerate-warnings")).toHaveTextContent("/api: does not resolve");
		expect(screen.queryByTestId("regenerate-running")).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "broken.example.com" }));
		expect(modals.showProxyHostModal).toHaveBeenCalledWith(7);
		fireEvent.click(screen.getByRole("button", { name: "2222" }));
		expect(modals.showStreamModal).toHaveBeenCalledWith(3);

		const keys = invalidate.mock.calls.map((call) => (call[0] as { queryKey: unknown[] }).queryKey[0]);
		expect(keys).toEqual(expect.arrayContaining(["proxy-hosts", "streams", "dead-hosts", "redirection-hosts"]));
	});

	it("shows a clean result without lists when everything is online", async () => {
		api.regenerateNginxConfigs.mockResolvedValue({
			checked: 1,
			regenerated: 1,
			offline: [],
			failed: [],
			warnings: [],
			durationMs: 120,
		});
		renderPage();
		await confirm();
		const result = await screen.findByTestId("regenerate-result");
		expect(result).toHaveClass("alert-success");
		expect(result).toHaveTextContent("Checked 1 host in 0.1 s: 1 online, 0 offline, 0 not regenerated.");
		expect(screen.queryByTestId("regenerate-offline")).toBeNull();
	});

	it("shows the API error, eg. a second regeneration running already", async () => {
		api.regenerateNginxConfigs.mockRejectedValue(
			new Error("All host configs are being regenerated already, wait for that to finish."),
		);
		renderPage();
		await confirm();
		expect(await screen.findByText(/being regenerated already/)).toBeInTheDocument();
		expect(screen.queryByTestId("regenerate-result")).toBeNull();
	});

	it("keeps a running regeneration and its result when the section is left and opened again", async () => {
		let resolve: (value: unknown) => void = () => {};
		api.regenerateNginxConfigs.mockReturnValue(new Promise((r) => (resolve = r)));
		const { unmount, queryClient } = renderPage();
		await confirm();
		expect(await screen.findByTestId("regenerate-running")).toBeInTheDocument();

		// eg. Settings > Default Site, the section unmounts
		unmount();
		renderPage(queryClient);
		expect(await screen.findByTestId("regenerate-running")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Regenerate all host configs/ })).toBeDisabled();

		await act(async () => {
			resolve({ checked: 1, regenerated: 1, offline: [], failed: [], warnings: [], durationMs: 100 });
		});
		expect(await screen.findByTestId("regenerate-result")).toHaveTextContent("Checked 1 host");
		expect(screen.getByRole("button", { name: /Regenerate all host configs/ })).toBeEnabled();
		expect(api.regenerateNginxConfigs).toHaveBeenCalledTimes(1);

		// and the finished result is still there after another switch
		cleanup();
		renderPage(queryClient);
		expect(await screen.findByTestId("regenerate-result")).toHaveTextContent("Checked 1 host");
	});

	it("dismisses the error of the last run", async () => {
		api.regenerateNginxConfigs.mockRejectedValue(new Error("nginx is broken"));
		renderPage();
		await confirm();
		expect(await screen.findByText("nginx is broken")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: /close alert/i }));
		await waitFor(() => expect(screen.queryByText("nginx is broken")).toBeNull());
	});
});
