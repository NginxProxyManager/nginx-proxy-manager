import type { Table as ReactTable, RowData } from "@tanstack/react-table";
import type { Features } from "./features";
import { TableBody } from "./TableBody";
import { TableHeader } from "./TableHeader";

interface TableFolders<TFields extends RowData> {
	// Rows returning an empty value are listed above the folders
	getFolder: (rowData: TFields) => string | undefined;
	// Drives the online/offline counts shown on the folder row
	isEnabled: (rowData: TFields) => boolean;
	// Folders start expanded, e.g. while searching so that matches are visible
	expandAll?: boolean;
}

interface TableLayoutProps<TFields extends RowData> {
	tableInstance: ReactTable<Features, TFields>;
	emptyState?: React.ReactNode;
	extraStyles?: {
		row: (rowData: TFields) => any | undefined;
	};
	folders?: TableFolders<TFields>;
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

export { type TableFolders, TableLayout, type TableLayoutProps };
