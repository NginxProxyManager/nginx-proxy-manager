import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "src/api/backend";
import { changeLocale, intl } from "src/locale";
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
				skipped: [
					{ hostType: "redirection_host", id: 4, name: "cert.example.com", message: "certificate request" },
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
		expect(screen.getByTestId("regenerate-skipped")).toHaveTextContent("1 host was skipped");
		expect(screen.getByTestId("regenerate-skipped")).toHaveTextContent("cert.example.com");
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
		expect(screen.getByTestId("regenerate-icon-ok")).toBeInTheDocument();
		expect(result).toHaveTextContent("Checked 1 host in 0.1 s: 1 online, 0 offline, 0 not regenerated.");
		expect(screen.queryByTestId("regenerate-offline")).toBeNull();
		expect(screen.queryByTestId("regenerate-skipped")).toBeNull();
	});

	it("doesn't show a run as clean when every host was skipped for a certificate request", async () => {
		api.regenerateNginxConfigs.mockResolvedValue({
			checked: 0,
			regenerated: 0,
			offline: [],
			failed: [],
			warnings: [],
			skipped: [{ hostType: "proxy_host", id: 3, name: "a.example.com", message: "certificate request running" }],
			durationMs: 10,
		});
		renderPage();
		await confirm();
		const result = await screen.findByTestId("regenerate-result");
		expect(result).not.toHaveClass("alert-success");
		expect(result).toHaveClass("alert-info");
		expect(screen.getByTestId("regenerate-icon-info")).toBeInTheDocument();
		expect(screen.getByTestId("regenerate-skipped")).toHaveTextContent("a.example.com");
	});

	it("shows the alert icon for a run that failed half way, also without offline or failed hosts", async () => {
		api.regenerateNginxConfigs.mockRejectedValue(
			new ApiError("Internal Error", {
				status: 500,
				regenerateSummary: {
					checked: 2,
					regenerated: 2,
					offline: [],
					failed: [],
					warnings: [],
					durationMs: 50,
				},
			}),
		);
		renderPage();
		await confirm();
		const partial = await screen.findByTestId("regenerate-partial");
		expect(partial).toHaveClass("alert-warning");
		expect(screen.getByTestId("regenerate-icon-alert")).toBeInTheDocument();
		expect(screen.queryByTestId("regenerate-icon-ok")).toBeNull();
	});

	it("shows the API error, eg. a second regeneration running already", async () => {
		api.regenerateNginxConfigs.mockRejectedValue(
			new Error("All host configs are being regenerated already, wait for that to finish."),
		);
		renderPage();
		await confirm();
		expect(await screen.findByText(/being regenerated already/)).toBeInTheDocument();
		expect(screen.queryByTestId("regenerate-result")).toBeNull();
		expect(screen.queryByTestId("regenerate-partial")).toBeNull();
	});

	it("shows the hosts a failed run changed next to its error", async () => {
		// eg. the final nginx reload failed after a host was taken offline
		api.regenerateNginxConfigs.mockRejectedValue(
			new ApiError("Internal Error", {
				status: 500,
				regenerateSummary: {
					checked: 3,
					regenerated: 1,
					offline: [
						{ hostType: "proxy_host", id: 7, name: "broken.example.com", error: "unknown directive" },
					],
					failed: [{ hostType: "dead_host", id: 5, name: "gone.example.com", error: "certificate missing" }],
					warnings: [],
					durationMs: 1500,
				},
			}),
		);
		renderPage();
		await confirm();

		expect(await screen.findByText("Internal Error")).toBeInTheDocument();
		const partial = await screen.findByTestId("regenerate-partial");
		expect(partial).toHaveClass("alert-warning");
		expect(partial).toHaveTextContent("The run failed, but it had already changed hosts");
		expect(partial).toHaveTextContent("Checked 3 hosts in 1.5 s: 1 online, 1 offline, 1 not regenerated.");
		expect(screen.getByTestId("regenerate-offline")).toHaveTextContent("broken.example.com");
		expect(screen.getByTestId("regenerate-failed")).toHaveTextContent("gone.example.com");
		expect(screen.queryByTestId("regenerate-result")).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "broken.example.com" }));
		expect(modals.showProxyHostModal).toHaveBeenCalledWith(7);

		// Dismissing the error keeps the list of changed hosts
		fireEvent.click(screen.getByRole("button", { name: /close alert/i }));
		await waitFor(() => expect(screen.queryByText("Internal Error")).toBeNull());
		expect(screen.getByTestId("regenerate-partial")).toBeInTheDocument();
	});

	it("tolerates an incomplete summary of a failed run", async () => {
		api.regenerateNginxConfigs.mockRejectedValue(
			new ApiError("Internal Error", {
				status: 500,
				regenerateSummary: { offline: [{ hostType: "stream", id: 2, name: "2222" }] },
			}),
		);
		renderPage();
		await confirm();
		const partial = await screen.findByTestId("regenerate-partial");
		expect(partial).toHaveTextContent("Checked 0 hosts in 0.0 s: 0 online, 1 offline, 0 not regenerated.");
		expect(screen.getByTestId("regenerate-offline")).toHaveTextContent("2222");
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

	it("German: offline hosts and broken locations worded in the UI language, nginx's error as it is", async () => {
		changeLocale("de");
		try {
			api.regenerateNginxConfigs.mockResolvedValue({
				checked: 2,
				regenerated: 1,
				offline: [
					{
						hostType: "proxy_host",
						id: 7,
						name: "broken.example.com",
						error: 'Advanced configuration: unknown directive "proxy_passs" (line 2).',
						details: {
							kind: "nginx_config",
							scope: "host",
							area: "host_advanced",
							relativeLine: 2,
							detail: 'Unknown directive "proxy_passs".',
						},
					},
				],
				failed: [],
				warnings: [
					{
						hostType: "proxy_host",
						id: 9,
						name: "app.example.com",
						message: '/old: Host "ghost" can\'t be resolved right now.',
						locations: [
							{
								index: 0,
								path: "/old",
								status: "unresolved",
								code: "unresolved",
								params: { host: "ghost" },
							},
							{
								index: 1,
								path: "/api",
								status: "quarantined",
								code: "rejected",
								params: { detail: 'Unknown directive "foo_bar".' },
								message: 'Disabled because nginx rejected it: unknown directive "foo_bar".',
							},
						],
					},
				],
				skipped: [
					{
						hostType: "stream",
						id: 4,
						name: "2222",
						message: "A certificate request for this host is running",
					},
				],
				durationMs: 1250,
			});
			renderPage();
			fireEvent.click(
				screen.getByRole("button", { name: intl.formatMessage({ id: "settings.nginx.regenerate.button" }) }),
			);
			fireEvent.click(
				await screen.findByRole("button", {
					name: intl.formatMessage({ id: "settings.nginx.regenerate.confirm-button" }),
				}),
			);
			const offline = await screen.findByTestId("regenerate-offline");
			expect(offline).toHaveTextContent(
				'Fehler in der benutzerdefinierten Nginx-Konfiguration, Zeile 2: Unknown directive "proxy_passs".',
			);
			expect(offline).not.toHaveTextContent("Advanced configuration");
			const warnings = screen.getByTestId("regenerate-warnings");
			expect(warnings).toHaveTextContent("/old:");
			// nginx's error on a line of its own, not glued to the sentence before it
			expect(warnings).toHaveTextContent(/\/api: .*nknown directive "foo_bar"\./);
			expect(warnings).not.toHaveTextContent(".:");
			// the decimal separator of the UI language
			expect(screen.getByTestId("regenerate-result")).toHaveTextContent("2 Hosts in 1,3 s geprüft");
			expect(screen.getByTestId("regenerate-skipped")).not.toHaveTextContent("A certificate request");
		} finally {
			changeLocale("en");
		}
	});

	it("Japanese falls back to English, with the singular for one host", () => {
		changeLocale("ja");
		try {
			for (const id of ["offline", "failed", "warnings", "skipped"]) {
				expect(intl.formatMessage({ id: `settings.nginx.regenerate.${id}` }, { count: 1 })).toMatch(/^1 host /);
			}
			expect(intl.formatMessage({ id: "settings.nginx.regenerate.audit" }, { checked: 1, offline: 0 })).toBe(
				"1 host, 0 offline",
			);
		} finally {
			changeLocale("en");
		}
	});

	it("a second run while one is running says so in the UI language", async () => {
		changeLocale("de");
		try {
			api.regenerateNginxConfigs.mockRejectedValue(
				new ApiError("All host configs are being regenerated already, wait for that to finish.", {
					status: 409,
					messageI18n: "settings.nginx.regenerate.busy",
				}),
			);
			renderPage();
			fireEvent.click(
				screen.getByRole("button", { name: intl.formatMessage({ id: "settings.nginx.regenerate.button" }) }),
			);
			fireEvent.click(
				await screen.findByRole("button", {
					name: intl.formatMessage({ id: "settings.nginx.regenerate.confirm-button" }),
				}),
			);
			expect(
				await screen.findByText(intl.formatMessage({ id: "settings.nginx.regenerate.busy" })),
			).toBeInTheDocument();
			expect(screen.queryByText(/being regenerated already/)).toBeNull();
		} finally {
			changeLocale("en");
		}
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
