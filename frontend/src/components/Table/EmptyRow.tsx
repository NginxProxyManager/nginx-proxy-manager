import type { Table as ReactTable } from "@tanstack/react-table";

interface Props {
	tableInstance: ReactTable<any>;
}
function EmptyRow({ tableInstance }: Props) {
	return (
		<tr>
			<td colSpan={tableInstance.getVisibleFlatColumns().length}>
				<p className="text-center">There are no items</p>
			</td>
		</tr>
	);
}

export { EmptyRow };
