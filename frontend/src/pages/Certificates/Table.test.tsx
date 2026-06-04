import { fireEvent, render, screen, within } from "@testing-library/react";
import { LocaleProvider } from "src/context";
import { describe, expect, it, vi } from "vitest";
import Table from "./Table";

vi.mock("src/hooks", () => ({
	useUser: () => ({
		data: {
			roles: ["admin"],
			permissions: {
				visibility: "all",
				proxyHosts: "manage",
				redirectionHosts: "manage",
				deadHosts: "manage",
				streams: "manage",
				accessLists: "manage",
				certificates: "manage",
			},
		},
		isLoading: false,
	}),
}));

describe("Certificates table sorting", () => {
	it("sorts rows when the name header is clicked", () => {
		render(
			<LocaleProvider>
				<Table
					data={[
						{
							id: 1,
							createdOn: "2026-01-01T00:00:00.000Z",
							modifiedOn: "2026-01-01T00:00:00.000Z",
							ownerUserId: 1,
							provider: "other",
							niceName: "Zulu Cert",
							domainNames: ["zulu.example"],
							expiresOn: "2027-01-01T00:00:00.000Z",
							meta: {},
							proxyHosts: [],
							deadHosts: [],
							redirectionHosts: [],
							streams: [],
						},
						{
							id: 2,
							createdOn: "2026-01-01T00:00:00.000Z",
							modifiedOn: "2026-01-01T00:00:00.000Z",
							ownerUserId: 1,
							provider: "other",
							niceName: "Alpha Cert",
							domainNames: ["alpha.example"],
							expiresOn: "2027-01-01T00:00:00.000Z",
							meta: {},
							proxyHosts: [],
							deadHosts: [],
							redirectionHosts: [],
							streams: [],
						},
					]}
				/>
			</LocaleProvider>,
		);

		fireEvent.click(screen.getByRole("columnheader", { name: /name/i }));

		const rows = screen.getAllByRole("row").slice(1);
		expect(within(rows[0]).getByText("Alpha Cert")).toBeTruthy();
		expect(within(rows[1]).getByText("Zulu Cert")).toBeTruthy();
	});
});
