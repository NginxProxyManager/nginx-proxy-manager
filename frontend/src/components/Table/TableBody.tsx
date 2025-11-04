import { flexRender } from "@tanstack/react-table";
import type { TableLayoutProps } from "src/components";
import { EmptyRow } from "./EmptyRow";

function TableBody<T>(props: TableLayoutProps<T>) {
	const { tableInstance, extraStyles, emptyState } = props;
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
			{rows.map((row: any) => {
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
