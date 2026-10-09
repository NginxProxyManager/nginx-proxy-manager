import type { Table as ReactTable, RowData } from "@tanstack/react-table";
import type { Features } from "./features";

interface Props<TData extends RowData> {
	tableInstance: ReactTable<Features, TData>;
}
function EmptyRow<TData extends RowData>({ tableInstance }: Props<TData>) {
	return (
		<tr>
			<td colSpan={tableInstance.getVisibleFlatColumns().length}>
				<p className="text-center">There are no items</p>
			</td>
		</tr>
	);
}

export { EmptyRow };
