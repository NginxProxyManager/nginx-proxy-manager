import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import type { TableLayoutProps } from "src/components";

function TableHeader<T>(props: TableLayoutProps<T>) {
	const { tableInstance } = props;
	const headerGroups = tableInstance.getHeaderGroups();

	return (
		<thead>
			{headerGroups.map((headerGroup: any) => (
				<tr key={headerGroup.id}>
					{headerGroup.headers.map((header: any) => {
						const { column } = header;
						const { className } = (column.columnDef.meta as any) ?? {};
						const sorted = column.getIsSorted();
						return (
							<th key={header.id} className={className} onClick={column.getToggleSortingHandler()}>
								<span className="d-inline-flex align-items-center gap-1">
									{typeof column.columnDef.header === "string" ? `${column.columnDef.header}` : null}
									{sorted === "asc" ? <IconChevronUp size={14} /> : null}
									{sorted === "desc" ? <IconChevronDown size={14} /> : null}
								</span>
							</th>
						);
					})}
				</tr>
			))}
		</thead>
	);
}

export { TableHeader };
