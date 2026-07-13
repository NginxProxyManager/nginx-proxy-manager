import { flexRender } from "@tanstack/react-table";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
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

	const visibleColumnCount = tableInstance.getVisibleLeafColumns().length;

	return (
		<tbody className="table-tbody">
			{rows.map((row: any) => {
				if (row.getIsGrouped()) {
					const isExpanded = row.getIsExpanded();
					return (
						<tr
							key={row.id}
							className="table-group-row table-active cursor-pointer"
							onClick={row.getToggleExpandedHandler()}
						>
							<td colSpan={visibleColumnCount}>
								<span className="d-inline-flex align-items-center gap-2">
									{isExpanded ? (
										<IconChevronDown size={16} />
									) : (
										<IconChevronRight size={16} />
									)}
									<strong>{String(row.groupingValue ?? "")}</strong>
									<span className="badge bg-secondary-lt">{row.subRows.length}</span>
								</span>
							</td>
						</tr>
					);
				}
				return (
					<tr key={row.id} {...extraStyles?.row(row.original)}>
						{row.getVisibleCells().map((cell: any) => {
							if (cell.getIsPlaceholder()) {
								return null;
							}
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
