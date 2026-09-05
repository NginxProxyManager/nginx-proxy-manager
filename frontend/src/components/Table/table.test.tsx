import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EmptyRow } from "./EmptyRow";
import { TableBody } from "./TableBody";
import { TableHeader } from "./TableHeader";
import { TableLayout } from "./TableLayout";

const emptyTable = {
	getVisibleFlatColumns: () => [{}, {}, {}],
	getRowModel: () => ({ rows: [] }),
	getHeaderGroups: () => [],
} as never;

describe("table components", () => {
	it("renders default and custom empty states", () => {
		const row = render(<table><tbody><EmptyRow tableInstance={emptyTable} /></tbody></table>);
		expect(screen.getByText("There are no items").closest("td")?.colSpan).toBe(3);
		row.unmount();

		const body = render(<table><TableBody tableInstance={emptyTable} emptyState={<tr><td>Custom empty</td></tr>} /></table>);
		expect(screen.getByText("Custom empty")).toBeInTheDocument();
		body.unmount();
		render(<TableLayout tableInstance={emptyTable} />);
		expect(screen.queryByRole("columnheader")).not.toBeInTheDocument();
	});

	it("renders rows, cell functions, metadata and extra styles", () => {
		const cell = {
			id: "cell-1",
			column: { columnDef: { cell: ({ value }: { value: string }) => <strong>{value}</strong>, meta: { className: "cell-class" } } },
			getContext: () => ({ value: "Rendered cell" }),
		};
		const table = {
			getRowModel: () => ({ rows: [{ id: "row-1", original: { active: true }, getVisibleCells: () => [cell] }] }),
		} as never;
		render(
			<table>
				<TableBody tableInstance={table} extraStyles={{ row: () => ({ className: "active-row" }) }} />
			</table>,
		);
		expect(screen.getByText("Rendered cell").closest("td")).toHaveClass("cell-class");
		expect(screen.getByText("Rendered cell").closest("tr")).toHaveClass("active-row");
	});

	it("renders sortable, unsorted, functional and placeholder headers", () => {
		const toggle = vi.fn();
		const header = (id: string, canSort: boolean, sorted: false | "asc" | "desc", content: unknown, placeholder = false) => ({
			id,
			isPlaceholder: placeholder,
			column: {
				columnDef: { header: content, meta: id === "plain" ? undefined : { className: `${id}-class` } },
				getCanSort: () => canSort,
				getIsSorted: () => sorted,
				getToggleSortingHandler: () => toggle,
			},
			getContext: () => ({ title: "Function header" }),
		});
		const table = {
			getHeaderGroups: () => [{
				id: "group",
				headers: [
					header("ascending", true, "asc", "Ascending"),
					header("descending", true, "desc", "Descending"),
					header("unsorted", true, false, ({ title }: { title: string }) => <span>{title}</span>),
					header("plain", false, false, "Plain"),
					header("placeholder", false, false, "Hidden", true),
				],
			}],
		} as never;
		render(<table><TableHeader tableInstance={table} /></table>);
		expect(screen.getByText("Function header")).toBeInTheDocument();
		expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
		fireEvent.click(screen.getByText("Ascending").closest("th") as HTMLElement);
		expect(toggle).toHaveBeenCalledOnce();
		expect(screen.getByText("Plain").closest("th")?.style.cursor).toBe("");
	});

	it("composes headers and rows in the responsive layout", () => {
		const table = {
			getRowModel: () => ({ rows: [{ id: "row", original: {}, getVisibleCells: () => [] }] }),
			getHeaderGroups: () => [],
		} as never;
		const view = render(<TableLayout tableInstance={table} />);
		expect(view.container.querySelector(".table-responsive table")).toBeInTheDocument();
	});
});
