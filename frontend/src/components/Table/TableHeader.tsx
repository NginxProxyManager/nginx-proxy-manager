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
						return (
							<th key={header.id} className={className}>
								{typeof column.columnDef.header === "string" ? `${column.columnDef.header}` : null}
							</th>
						);
					})}
				</tr>
			))}
		</thead>
	);
}

export { TableHeader };
