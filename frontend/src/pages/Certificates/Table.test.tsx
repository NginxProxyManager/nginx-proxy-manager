import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Certificate } from "src/api/backend";
import { renderWithProviders } from "src/testUtils";
import { afterEach, describe, expect, it, vi } from "vitest";
import Table from "./Table";

const api = vi.hoisted(() => ({ getUser: vi.fn() }));

// HasPermission reads the signed-in user's permissions via useUser("me") -> getUser
vi.mock("src/api/backend", async (importOriginal) => ({
	...(await importOriginal<typeof import("src/api/backend")>()),
	...api,
}));

const makeCertificate = (id: number, niceName: string, provider: string): Certificate =>
	({
		id,
		createdOn: "2025-01-01 00:00:00",
		modifiedOn: "2025-01-01 00:00:00",
		ownerUserId: 1,
		provider,
		niceName,
		domainNames: [`${niceName.toLowerCase().replace(/\s+/g, "-")}.example.com`],
		expiresOn: "2030-01-01 00:00:00",
		meta: {},
		proxyHosts: [],
		redirectionHosts: [],
		deadHosts: [],
		streams: [],
	}) as Certificate;

const data = [makeCertificate(7, "Custom One", "other"), makeCertificate(8, "Lets Encrypt One", "letsencrypt")];

const userWith = (certificates: string) => ({
	id: 2,
	name: "Someone",
	email: "someone@example.com",
	roles: [],
	permissions: { certificates },
});

const rowFor = async (text: string) => {
	const cell = await screen.findByText(text);
	const row = cell.closest("tr");
	if (!row) throw new Error(`No table row for ${text}`);
	return row;
};

const renderTable = async (permission: string, onUpdate = vi.fn()) => {
	api.getUser.mockResolvedValue(userWith(permission));
	const { queryClient } = renderWithProviders(<Table data={data} onUpdate={onUpdate} />);
	// Permission gated actions are hidden while the user is loading, so wait until it's loaded
	await waitFor(() => expect(queryClient.getQueryState(["user", "me"])?.status).toBe("success"));
	expect(api.getUser).toHaveBeenCalledWith("me", ["permissions"]);
	return onUpdate;
};

describe("Certificates table", () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("offers Update only for custom certificates", async () => {
		await renderTable("manage");

		const customRow = await rowFor("Custom One");
		// Let's Encrypt rows are labelled with their domain names
		const leRow = await rowFor("lets-encrypt-one.example.com");

		expect(await within(customRow).findByRole("link", { name: "Update" })).toBeInTheDocument();
		// Download is behind the same permission check, so it proves the menu is fully rendered
		expect(await within(leRow).findByRole("link", { name: "Download" })).toBeInTheDocument();
		expect(within(leRow).queryByRole("link", { name: "Update" })).not.toBeInTheDocument();
	});

	it("hides Update from users without manage permission", async () => {
		await renderTable("view");

		const customRow = await rowFor("Custom One");
		// Renew is not permission gated, so the menu itself is rendered
		expect(within(customRow).getByRole("link", { name: "Renew" })).toBeInTheDocument();
		expect(within(customRow).queryByRole("link", { name: "Update" })).not.toBeInTheDocument();
		expect(within(customRow).queryByRole("link", { name: "Download" })).not.toBeInTheDocument();
	});

	it("calls onUpdate with the certificate id", async () => {
		const onUpdate = await renderTable("manage");

		const customRow = await rowFor("Custom One");
		fireEvent.click(await within(customRow).findByRole("link", { name: "Update" }));

		expect(onUpdate).toHaveBeenCalledTimes(1);
		expect(onUpdate).toHaveBeenCalledWith(7);
	});
});
