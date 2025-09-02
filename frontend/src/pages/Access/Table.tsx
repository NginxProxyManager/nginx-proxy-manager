import { IconDotsVertical, IconEdit, IconTrash } from "@tabler/icons-react";
import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import type { AccessList } from "src/api/backend";
import { GravatarFormatter, ValueWithDateFormatter } from "src/components";
import { TableLayout } from "src/components/Table/TableLayout";
import { intl } from "src/locale";
import Empty from "./Empty";

interface Props {
	data: AccessList[];
	isFetching?: boolean;
}
export default function Table({ data, isFetching }: Props) {
	const columnHelper = createColumnHelper<AccessList>();
	const columns = useMemo(
		() => [
			columnHelper.accessor((row: any) => row.owner, {
				id: "owner",
				cell: (info: any) => {
					const value = info.getValue();
					return <GravatarFormatter url={value.avatar} name={value.name} />;
				},
				meta: {
					className: "w-1",
				},
			}),
			columnHelper.accessor((row: any) => row, {
				id: "name",
				header: intl.formatMessage({ id: "column.name" }),
				cell: (info: any) => {
					const value = info.getValue();
					// Bit of a hack to reuse the DomainsFormatter component
					return <ValueWithDateFormatter value={value.name} createdOn={value.createdOn} />;
				},
			}),
			columnHelper.accessor((row: any) => row.items, {
				id: "items",
				header: intl.formatMessage({ id: "column.authorization" }),
				cell: (info: any) => {
					const value = info.getValue();
					return intl.formatMessage({ id: "access.auth-count" }, { count: value.length });
				},
			}),
			columnHelper.accessor((row: any) => row.clients, {
				id: "clients",
				header: intl.formatMessage({ id: "column.access" }),
				cell: (info: any) => {
					const value = info.getValue();
					return intl.formatMessage({ id: "access.access-count" }, { count: value.length });
				},
			}),
			columnHelper.accessor((row: any) => row.satisfyAny, {
				id: "satisfyAny",
				header: intl.formatMessage({ id: "column.satisfy" }),
				cell: (info: any) => {
					const t = info.getValue() ? "access.satisfy-any" : "access.satisfy-all";
					return intl.formatMessage({ id: t });
				},
			}),
			columnHelper.accessor((row: any) => row.proxyHostCount, {
				id: "proxyHostCount",
				header: intl.formatMessage({ id: "proxy-hosts.title" }),
				cell: (info: any) => {
					return intl.formatMessage({ id: "proxy-hosts.count" }, { count: info.getValue() });
				},
			}),
			columnHelper.display({
				id: "id", // todo: not needed for a display?
				cell: (info: any) => {
					return (
						<span className="dropdown">
							<button
								type="button"
								className="btn dropdown-toggle btn-action btn-sm px-1"
								data-bs-boundary="viewport"
								data-bs-toggle="dropdown"
							>
								<IconDotsVertical />
							</button>
							<div className="dropdown-menu dropdown-menu-end">
								<span className="dropdown-header">
									{intl.formatMessage(
										{
											id: "access.actions-title",
										},
										{ id: info.row.original.id },
									)}
								</span>
								<a className="dropdown-item" href="#">
									<IconEdit size={16} />
									{intl.formatMessage({ id: "action.edit" })}
								</a>
								<div className="dropdown-divider" />
								<a className="dropdown-item" href="#">
									<IconTrash size={16} />
									{intl.formatMessage({ id: "action.delete" })}
								</a>
							</div>
						</span>
					);
				},
				meta: {
					className: "text-end w-1",
				},
			}),
		],
		[columnHelper],
	);

	const tableInstance = useReactTable<AccessList>({
		columns,
		data,
		getCoreRowModel: getCoreRowModel(),
		rowCount: data.length,
		meta: {
			isFetching,
		},
		enableSortingRemoval: false,
	});

	return <TableLayout tableInstance={tableInstance} emptyState={<Empty tableInstance={tableInstance} />} />;
}
