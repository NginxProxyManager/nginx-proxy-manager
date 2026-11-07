import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
	type ApiToken,
	type ApiTokenOptions,
	createApiToken,
	getApiTokenOptions,
	getApiTokens,
	revokeApiToken,
} from "src/api/backend/apiTokens";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ApiTokens from ".";
import CreateTokenModal from "./CreateTokenModal";

vi.mock("src/api/backend/apiTokens", async (importOriginal) => ({
	...(await importOriginal<typeof import("src/api/backend/apiTokens")>()),
	createApiToken: vi.fn(),
	getApiTokens: vi.fn(),
	getApiTokenOptions: vi.fn(),
	revokeApiToken: vi.fn(),
}));
vi.mock("src/components", async () => ({
	...(await import("src/components/Button")),
	Loading: () => <div>Loading</div>,
}));

const options: ApiTokenOptions = {
	scopes: ["proxy_hosts:read", "proxy_hosts:write", "streams:read"],
	visibility: "user",
	requires2fa: false,
	maxExpiryDays: 365,
	defaultExpiryDays: 30,
};
const metadata: ApiToken = {
	id: 12,
	name: "Inventory integration",
	scopes: ["proxy_hosts:read"],
	visibility: "user",
	createdOn: "2026-10-14T00:00:00Z",
	expiresOn: "2099-11-14T00:00:00Z",
	status: "active",
	lastUsedOn: null,
	revokedOn: null,
};
const result = { ...metadata, token: "npm_test_only_not_a_real_secret" };
const callbacks = { onCreated: vi.fn(), onClose: vi.fn(), onRefresh: vi.fn() };

function fillForm(twoFactor = false) {
	fireEvent.change(screen.getByLabelText("Token name"), { target: { value: "Inventory integration" } });
	fireEvent.change(screen.getByLabelText("Confirm your current password"), { target: { value: "test-password" } });
	fireEvent.click(
		within(screen.getByRole("group", { name: "Proxy Hosts" })).getByRole("radio", { name: "Read only" }),
	);
	if (twoFactor)
		fireEvent.change(screen.getByLabelText("Two-factor authentication or backup code"), {
			target: { value: "123456" },
		});
}

function renderPage() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
	const view = render(
		<QueryClientProvider client={queryClient}>
			<ApiTokens />
		</QueryClientProvider>,
	);
	return { ...view, queryClient };
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(createApiToken).mockResolvedValue(result);
	vi.mocked(getApiTokens).mockResolvedValue([]);
	vi.mocked(getApiTokenOptions).mockResolvedValue(options);
	vi.mocked(revokeApiToken).mockResolvedValue({ revoked: true });
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("Create API token", () => {
	it("uses the standard admin dialog width with scrollable content", () => {
		render(<CreateTokenModal options={options} {...callbacks} />);
		const dialog = screen.getByRole("dialog").querySelector(".modal-dialog");
		expect(dialog).toHaveClass("modal-dialog-scrollable");
		expect(dialog).not.toHaveClass("modal-lg");
		expect(screen.getByLabelText("Token name").closest("form")).toBeTruthy();
	});

	it("starts with no access and creates only explicitly selected read permissions", async () => {
		render(<CreateTokenModal options={options} {...callbacks} />);
		expect(screen.getByRole("button", { name: "Create API Token" })).toBeDisabled();
		for (const radio of screen.getAllByRole("radio", { name: "No access" })) expect(radio).toBeChecked();
		expect(screen.getByRole("radio", { name: "Read, create, update and delete" })).not.toBeChecked();
		expect(screen.queryByLabelText("Two-factor authentication or backup code")).not.toBeInTheDocument();
		fillForm();
		fireEvent.click(screen.getByRole("button", { name: "Create API Token" }));
		expect(await screen.findByLabelText("Your API token")).toHaveValue(result.token);
		expect(screen.getByRole("dialog").querySelector(".modal-dialog")).not.toHaveClass("modal-lg");
		expect(createApiToken).toHaveBeenCalledWith({
			name: metadata.name,
			expiresInDays: 30,
			scopes: ["proxy_hosts:read"],
			password: "test-password",
		});
		expect(callbacks.onCreated).toHaveBeenCalledWith(metadata);
		expect(callbacks.onCreated.mock.calls[0][0]).not.toHaveProperty("token");
		expect(screen.queryByLabelText("Confirm your current password")).not.toBeInTheDocument();
	});

	it("requires 2FA when enabled and sends explicit write scope and expiry", async () => {
		render(<CreateTokenModal options={{ ...options, requires2fa: true }} {...callbacks} />);
		fillForm();
		expect(screen.getByRole("button", { name: "Create API Token" })).toBeDisabled();
		fireEvent.change(screen.getByLabelText("Two-factor authentication or backup code"), {
			target: { value: "123456" },
		});
		fireEvent.change(screen.getByLabelText("Expires in (days)"), { target: { value: "7" } });
		fireEvent.click(screen.getByRole("radio", { name: "Read, create, update and delete" }));
		fireEvent.click(screen.getByRole("button", { name: "Create API Token" }));
		await screen.findByLabelText("Your API token");
		expect(createApiToken).toHaveBeenCalledWith({
			name: metadata.name,
			expiresInDays: 7,
			scopes: ["proxy_hosts:write"],
			password: "test-password",
			code: "123456",
		});
	});

	it("blocks duplicate submits and dismissal while creation is pending", async () => {
		let resolve!: (value: typeof result) => void;
		vi.mocked(createApiToken).mockReturnValue(
			new Promise((done) => {
				resolve = done;
			}),
		);
		render(<CreateTokenModal options={options} {...callbacks} />);
		fillForm();
		const form = screen.getByLabelText("Token name").closest("form");
		expect(form).not.toBeNull();
		fireEvent.submit(form as HTMLFormElement);
		fireEvent.submit(form as HTMLFormElement);
		expect(createApiToken).toHaveBeenCalledTimes(1);
		expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
		expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
		await act(async () => {
			resolve(result);
		});
		expect(await screen.findByLabelText("Your API token")).toHaveValue(result.token);
	});

	it("clears credentials after failure and refreshes metadata before an intentional retry", async () => {
		vi.mocked(createApiToken).mockRejectedValueOnce(new Error("Invalid password"));
		render(<CreateTokenModal options={{ ...options, requires2fa: true }} {...callbacks} />);
		fillForm(true);
		fireEvent.click(screen.getByRole("button", { name: "Create API Token" }));
		expect(await screen.findByText("Invalid password")).toBeVisible();
		expect(screen.getByLabelText("Confirm your current password")).toHaveValue("");
		expect(screen.getByLabelText("Two-factor authentication or backup code")).toHaveValue("");
		expect(callbacks.onRefresh).toHaveBeenCalledOnce();
		expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
		fillForm(true);
		fireEvent.click(screen.getByRole("button", { name: "Create API Token" }));
		await screen.findByLabelText("Your API token");
		expect(screen.queryByText("Invalid password")).not.toBeInTheDocument();
		expect(createApiToken).toHaveBeenCalledTimes(2);
	});

	it.each(["0", "366", "1.5"])("rejects out-of-range or fractional expiry %s", (expiry) => {
		render(<CreateTokenModal options={options} {...callbacks} />);
		fillForm();
		fireEvent.change(screen.getByLabelText("Expires in (days)"), { target: { value: expiry } });
		fireEvent.submit(screen.getByLabelText("Token name").closest("form") as HTMLFormElement);
		expect(createApiToken).not.toHaveBeenCalled();
	});

	it("does not deliver a late secret after navigation unmounts the dialog", async () => {
		let resolve!: (value: typeof result) => void;
		vi.mocked(createApiToken).mockReturnValue(
			new Promise((done) => {
				resolve = done;
			}),
		);
		const { unmount } = render(<CreateTokenModal options={options} {...callbacks} />);
		fillForm();
		fireEvent.click(screen.getByRole("button", { name: "Create API Token" }));
		unmount();
		await act(async () => {
			resolve(result);
		});
		expect(callbacks.onCreated).not.toHaveBeenCalled();
		expect(document.body).not.toHaveTextContent(result.token);
	});

	it("copies only on request and clears the displayed secret on dismissal", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.spyOn(navigator, "clipboard", "get").mockReturnValue({ writeText } as unknown as Clipboard);
		render(<CreateTokenModal options={options} {...callbacks} />);
		fillForm();
		fireEvent.click(screen.getByRole("button", { name: "Create API Token" }));
		const input = await screen.findByLabelText("Your API token");
		expect(writeText).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: "Copy token" }));
		expect(await screen.findByRole("button", { name: "Copied" })).toBeVisible();
		expect(writeText).toHaveBeenCalledWith(result.token);
		fireEvent.click(screen.getByRole("button", { name: "I have saved the token" }));
		expect(input).toHaveValue("");
		expect(callbacks.onClose).toHaveBeenCalledOnce();
	});

	it("keeps the secret available for manual copy if the clipboard fails", async () => {
		vi.spyOn(navigator, "clipboard", "get").mockReturnValue({
			writeText: vi.fn().mockRejectedValue(new Error("denied")),
		} as unknown as Clipboard);
		render(<CreateTokenModal options={options} {...callbacks} />);
		fillForm();
		fireEvent.click(screen.getByRole("button", { name: "Create API Token" }));
		await screen.findByLabelText("Your API token");
		fireEvent.click(screen.getByRole("button", { name: "Copy token" }));
		expect(await screen.findByText(/Could not copy automatically/)).toBeVisible();
		expect(screen.getByLabelText("Your API token")).toHaveValue(result.token);
	});
});

describe("Personal API Tokens page", () => {
	it("shows the empty state and disables creation for accounts without resource permissions", async () => {
		vi.mocked(getApiTokenOptions).mockResolvedValue({ ...options, scopes: [] });
		renderPage();
		expect(await screen.findByText("You have no API tokens yet.")).toBeVisible();
		expect(screen.getByRole("button", { name: "Create API Token" })).toBeDisabled();
		expect(screen.getByText(/Your account has no resource permissions/)).toBeVisible();
	});

	it("shows backend-invalidated credentials as revoked without inventing a revocation date", async () => {
		vi.mocked(getApiTokens).mockResolvedValue([{ ...metadata, status: "revoked", revokedOn: null }]);
		renderPage();
		expect(await screen.findByText("Revoked")).toBeVisible();
		expect(screen.queryByText("Active")).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Revoke" })).not.toBeInTheDocument();
	});

	it("shows metadata, confirms revocation, and resets an error when cancelled", async () => {
		vi.mocked(getApiTokens).mockResolvedValue([metadata]);
		vi.mocked(revokeApiToken).mockRejectedValueOnce(new Error("Could not revoke the API token."));
		renderPage();
		expect(await screen.findByText(metadata.name)).toBeVisible();
		expect(screen.getByText("proxy_hosts:read")).toBeVisible();
		expect(screen.getByText("Never")).toBeVisible();
		fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
		expect(revokeApiToken).not.toHaveBeenCalled();
		const dialog = screen.getByRole("dialog");
		fireEvent.click(within(dialog).getByRole("button", { name: "Revoke" }));
		expect(await screen.findByText("Could not revoke the API token.")).toBeVisible();
		fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
		fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
		expect(screen.queryByText("Could not revoke the API token.")).not.toBeInTheDocument();
		vi.mocked(getApiTokens).mockResolvedValue([
			{ ...metadata, revokedOn: "2026-10-14T01:00:00Z", status: "revoked" },
		]);
		fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Revoke" }));
		expect(await screen.findByText("Revoked")).toBeVisible();
		expect(screen.queryByRole("button", { name: "Revoke" })).not.toBeInTheDocument();
		expect(revokeApiToken).toHaveBeenCalledWith(metadata.id);
	});

	it("keeps secrets and step-up credentials out of caches and storage, including after re-opening", async () => {
		const storage = vi.spyOn(Storage.prototype, "setItem");
		const { queryClient } = renderPage();
		await screen.findByText("You have no API tokens yet.");
		fireEvent.click(screen.getByRole("button", { name: "Create API Token" }));
		fillForm();
		fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Create API Token" }));
		await screen.findByLabelText("Your API token");
		const cached = JSON.stringify(
			queryClient
				.getQueryCache()
				.getAll()
				.map((query) => query.state.data),
		);
		expect(cached).not.toContain(result.token);
		expect(cached).not.toContain("test-password");
		expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
		expect(storage).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: "Close" }));
		expect(screen.queryByLabelText("Your API token")).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Create API Token" }));
		expect(screen.getByLabelText("Token name")).toHaveValue("");
		expect(screen.getByLabelText("Confirm your current password")).toHaveValue("");
		expect(screen.queryByLabelText("Your API token")).not.toBeInTheDocument();
	});

	it("recovers from a list/options failure using Retry", async () => {
		vi.mocked(getApiTokens).mockRejectedValueOnce(new Error("Failed to load tokens"));
		vi.mocked(getApiTokenOptions).mockRejectedValueOnce(new Error("Failed to load options"));
		renderPage();
		expect(await screen.findByRole("button", { name: "Retry" })).toBeEnabled();
		fireEvent.click(screen.getByRole("button", { name: "Retry" }));
		expect(await screen.findByText("You have no API tokens yet.")).toBeVisible();
		await waitFor(() => expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument());
		expect(screen.getByRole("button", { name: "Create API Token" })).toBeEnabled();
	});
});
