import { flexRender } from "@tanstack/react-table";
import { cloneElement, isValidElement } from "react";
import type { TableLayoutProps } from "src/components";
import { EmptyRow } from "./EmptyRow";

function TableBody<T>(props: TableLayoutProps<T>) {
	const { tableInstance, extraStyles, emptyState, renderRow } = props;
	const rows = tableInstance.getRowModel().rows;

	if (rows.length === 0) {
		return (
			<tbody className="table-tbody">
				{emptyState ? emptyState : <EmptyRow tableInstance={tableInstance} />}
			</tbody>
		);
	}

	return (
		<tbody className="table-tbody">
			{rows.map((row) => {
				if (renderRow) {
					const node = renderRow(row);
					return isValidElement(node) ? cloneElement(node, { key: row.id } as any) : node;
				}
				return (
					<tr key={row.id} {...extraStyles?.row(row.original)}>
						{row.getVisibleCells().map((cell: any) => {
							const { className } = (cell.column.columnDef.meta as any) ?? {};
							return (
								<td key={cell.id} className={className}>
									{flexRender(cell.column.columnDef.cell, cell.getContext())}
								</td>
							);
						})}
					</tr>
				);
			})}
		</tbody>
	);
}

export { TableBody };
