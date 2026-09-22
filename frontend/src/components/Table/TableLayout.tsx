import type { Table as ReactTable, RowData } from "@tanstack/react-table";
import type { Features } from "./features";
import { TableBody } from "./TableBody";
import { TableHeader } from "./TableHeader";

interface TableLayoutProps<TFields extends RowData> {
	tableInstance: ReactTable<Features, TFields>;
	emptyState?: React.ReactNode;
	extraStyles?: {
		row: (rowData: TFields) => any | undefined;
	};
}
function TableLayout<TFields extends RowData>(props: TableLayoutProps<TFields>) {
	const hasRows = props.tableInstance.getRowModel().rows.length > 0;
	return (
		<div className="table-responsive">
			<table className="table table-vcenter table-selectable mb-0">
				{hasRows ? <TableHeader tableInstance={props.tableInstance} /> : null}
				<TableBody {...props} />
			</table>
		</div>
	);
}

export { TableLayout, type TableLayoutProps };
