import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import EasyModal from "ez-modal-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { showHTTPCertificateModal } from "./HTTPCertificateModal";

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
	localStorage.clear();
	vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	fetchMock.mockReset();
});
async function openAndTest(domains: string[], payload: Record<string, string>) {
	fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }));
	render(
		<QueryClientProvider client={new QueryClient()}>
			<EasyModal.Provider />
		</QueryClientProvider>,
	);
	await act(async () => {
		showHTTPCertificateModal();
	});
	const input = await screen.findByRole("combobox", { expanded: false });
	for (const domain of domains) {
		fireEvent.change(input, { target: { value: domain } });
		fireEvent.keyDown(input, { key: "Enter", code: "Enter", keyCode: 13 });
		await waitFor(() => expect(input).toHaveValue(""));
	}
	fireEvent.click(screen.getByRole("button", { name: "Test" }));
	await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
	expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ domains });
}
describe("mounted HTTP certificate modal", () => {
	it("renders a hyphenated result without changing its label", async () => {
		await openAndTest(["test-domain.example"], { "test-domain.example": "wrong-data" });
		expect(await screen.findByText("test-domain.example:")).toBeVisible();
		expect(screen.queryByText("testDomain.example:")).not.toBeInTheDocument();
	});
	it("renders both collision-prone domains with distinct results", async () => {
		await openAndTest(["test-domain.example", "test--domain.example"], {
			"test-domain.example": "ok",
			"test--domain.example": "no-host",
		});
		const first = await screen.findByText("test-domain.example:");
		const second = await screen.findByText("test--domain.example:");
		expect(
			first.parentElement?.querySelector('[data-translation-id="certificates.http.reachability-ok"]'),
		).not.toBeNull();
		expect(
			second.parentElement?.querySelector('[data-translation-id="certificates.http.reachability-not-resolved"]'),
		).not.toBeNull();
	});
});
