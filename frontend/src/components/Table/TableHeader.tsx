import { IconArrowsSort, IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { flexRender } from "@tanstack/react-table";
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
						const canSort = column.getCanSort();
						const sortDir = column.getIsSorted();

						const headerContent = header.isPlaceholder
							? null
							: typeof column.columnDef.header === "string"
								? column.columnDef.header
								: flexRender(column.columnDef.header, header.getContext());

						const sortIcon = canSort ? (
							sortDir === "asc" ? (
								<IconChevronUp size={14} className="ms-1" />
							) : sortDir === "desc" ? (
								<IconChevronDown size={14} className="ms-1" />
							) : (
								<IconArrowsSort size={14} className="ms-1 opacity-50" />
							)
						) : null;

						return (
							<th
								key={header.id}
								className={className}
								onClick={canSort ? column.getToggleSortingHandler() : undefined}
								style={canSort ? { cursor: "pointer", userSelect: "none" } : undefined}
							>
								{headerContent}
								{sortIcon}
							</th>
						);
					})}
				</tr>
			))}
		</thead>
	);
}

export { TableHeader };
