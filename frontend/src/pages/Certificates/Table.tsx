import { IconDotsVertical, IconEdit, IconPower, IconTrash } from "@tabler/icons-react";
import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import type { Certificate } from "src/api/backend";
import { DomainsFormatter, GravatarFormatter } from "src/components";
import { TableLayout } from "src/components/Table/TableLayout";
import { intl, T } from "src/locale";
import Empty from "./Empty";

interface Props {
	data: Certificate[];
	isFetching?: boolean;
}
export default function Table({ data, isFetching }: Props) {
	const columnHelper = createColumnHelper<Certificate>();
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
				id: "domainNames",
				header: intl.formatMessage({ id: "column.name" }),
				cell: (info: any) => {
					const value = info.getValue();
					return <DomainsFormatter domains={value.domainNames} createdOn={value.createdOn} />;
				},
			}),
			columnHelper.accessor((row: any) => row.provider, {
				id: "provider",
				header: intl.formatMessage({ id: "column.provider" }),
				cell: (info: any) => {
					return info.getValue();
				},
			}),
			columnHelper.accessor((row: any) => row.expires_on, {
				id: "expires_on",
				header: intl.formatMessage({ id: "column.expires" }),
				cell: (info: any) => {
					return info.getValue();
				},
			}),
			columnHelper.accessor((row: any) => row, {
				id: "id",
				header: intl.formatMessage({ id: "column.status" }),
				cell: (info: any) => {
					return info.getValue();
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
									<T id="certificates.actions-title" data={{ id: info.row.original.id }} />
								</span>
								<a className="dropdown-item" href="#">
									<IconEdit size={16} />
									<T id="action.edit" />
								</a>
								<a className="dropdown-item" href="#">
									<IconPower size={16} />
									<T id="action.disable" />
								</a>
								<div className="dropdown-divider" />
								<a className="dropdown-item" href="#">
									<IconTrash size={16} />
									<T id="action.delete" />
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

	const tableInstance = useReactTable<Certificate>({
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
