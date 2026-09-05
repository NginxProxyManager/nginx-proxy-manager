import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ user: { data: undefined as unknown, isLoading: false }, allowed: false }));
vi.mock("src/hooks", () => ({ useUser: () => state.user }));
vi.mock("src/modules/Permissions", () => ({
	ADMIN: "admin",
	MANAGE: "manage",
	hasPermission: () => state.allowed,
}));
vi.mock("src/locale", () => ({ T: ({ id }: { id: string }) => <span>{id}</span> }));
vi.mock("src/components", () => ({
	Button: ({ children, onClick, className }: { children: ReactNode; onClick?: () => void; className?: string }) => <button type="button" className={className} onClick={onClick}>{children}</button>,
	HasPermission: ({ children }: { children: ReactNode }) => <>{children}</>,
	Loading: () => <div>loading-inline</div>,
	LoadingPage: () => <div>loading-page</div>,
}));

import { EmptyData } from "./EmptyData";
import { HasPermission } from "./HasPermission";
import { SiteContainer } from "./SiteContainer";

afterEach(cleanup);

describe("permission and empty states", () => {
	it("passes children through when no protected section is requested", () => {
		render(<HasPermission permission="view">Visible</HasPermission>);
		expect(screen.getByText("Visible")).toBeInTheDocument();
	});

	it("renders loading, denied, hidden, and allowed permission states", () => {
		state.user = { data: undefined, isLoading: true };
		const view = render(<HasPermission section="proxyHosts" permission="view">Protected</HasPermission>);
		expect(screen.getByText("loading-inline")).toBeInTheDocument();
		view.rerender(<HasPermission section="proxyHosts" permission="view" pageLoading>Protected</HasPermission>);
		expect(screen.getByText("loading-page")).toBeInTheDocument();
		view.rerender(<HasPermission section="proxyHosts" permission="view" hideError>Protected</HasPermission>);
		expect(view.container).toBeEmptyDOMElement();

		state.user = { data: {}, isLoading: false };
		state.allowed = false;
		view.rerender(<HasPermission section="proxyHosts" permission="view">Protected</HasPermission>);
		expect(screen.getByText("no-permission-error")).toBeInTheDocument();
		view.rerender(<HasPermission section="proxyHosts" permission="view" hideError>Protected</HasPermission>);
		expect(view.container).toBeEmptyDOMElement();
		state.allowed = true;
		view.rerender(<HasPermission section="proxyHosts" permission="view">Protected</HasPermission>);
		expect(screen.getByText("Protected")).toBeInTheDocument();
	});

	it("renders filtered, default, and custom empty table states", () => {
		const onNew = vi.fn();
		const table = { getVisibleFlatColumns: () => [{}, {}] } as never;
		const view = render(<table><tbody><EmptyData tableInstance={table} object="host" objects="hosts" isFiltered /></tbody></table>);
		expect(screen.getByText("empty-search")).toBeInTheDocument();
		view.rerender(<table><tbody><EmptyData tableInstance={table} object="host" objects="hosts" onNew={onNew} /></tbody></table>);
		fireEvent.click(screen.getByRole("button", { name: "object.add" }));
		expect(onNew).toHaveBeenCalledOnce();
		view.rerender(<table><tbody><EmptyData tableInstance={table} object="host" objects="hosts" customAddBtn={<button type="button">Custom add</button>} /></tbody></table>);
		expect(screen.getByText("Custom add")).toBeInTheDocument();
	});

	it("renders site container content", () => {
		render(<SiteContainer>Contained</SiteContainer>);
		expect(screen.getByText("Contained")).toBeInTheDocument();
	});
});
