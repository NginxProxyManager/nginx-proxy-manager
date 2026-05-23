import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import type { AuditLog } from "src/api/backend";
import { EventFormatter, GravatarFormatter } from "src/components";
import { TableLayout } from "src/components/Table/TableLayout";
import { intl, T } from "src/locale";

interface Props {
	data: AuditLog[];
	isFetching?: boolean;
	onSelectItem?: (id: number) => void;
}
export default function Table({ data, isFetching, onSelectItem }: Props) {
	const columnHelper = createColumnHelper<AuditLog>();
	const columns = useMemo(
		() => [
			columnHelper.accessor((row: AuditLog) => row.user, {
				id: "user.avatar",
				cell: (info: any) => {
					const value = info.getValue();
					return <GravatarFormatter url={value ? value.avatar : ""} name={value ? value.name : ""} />;
				},
				meta: {
					className: "w-1",
				},
			}),
			columnHelper.accessor((row: AuditLog) => row, {
				id: "objectType",
				header: intl.formatMessage({ id: "column.event" }),
				cell: (info: any) => {
					return <EventFormatter row={info.getValue()} />;
				},
			}),
			columnHelper.display({
				id: "id",
				cell: (info: any) => {
					return (
						<button
							type="button"
							className="btn btn-action btn-sm px-1"
							onClick={(e) => {
								e.preventDefault();
								onSelectItem?.(info.row.original.id);
							}}
						>
							<T id="action.view-details" />
						</button>
					);
				},
				meta: {
					className: "text-end w-1",
				},
			}),
		],
		[columnHelper, onSelectItem],
	);

	const tableInstance = useReactTable<AuditLog>({
		columns,
		data,
		getCoreRowModel: getCoreRowModel(),
		rowCount: data.length,
		meta: {
			isFetching,
		},
		enableSortingRemoval: false,
	});

	return <TableLayout tableInstance={tableInstance} />;
}
