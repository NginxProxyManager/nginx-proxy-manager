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

describe("Access table sorting", () => {
	it("sorts rows when the name header is clicked", () => {
		render(
			<LocaleProvider>
				<Table
					data={[
						{
							id: 1,
							ownerUserId: 1,
							name: "Zulu",
							meta: {},
							satisfyAny: false,
							passAuth: false,
							proxyHostCount: 0,
							items: [],
							clients: [],
						},
						{
							id: 2,
							ownerUserId: 1,
							name: "Alpha",
							meta: {},
							satisfyAny: true,
							passAuth: false,
							proxyHostCount: 0,
							items: [],
							clients: [],
						},
					]}
				/>
			</LocaleProvider>,
		);

		fireEvent.click(screen.getByRole("columnheader", { name: /name/i }));

		const rows = screen.getAllByRole("row").slice(1);
		expect(within(rows[0]).getByText("Alpha")).toBeTruthy();
		expect(within(rows[1]).getByText("Zulu")).toBeTruthy();
	});
});
