import { IconDotsVertical, IconEdit, IconTrash } from "@tabler/icons-react";
import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import type { AccessList } from "src/api/backend";
import { EmptyData, GravatarFormatter, HasPermission, ValueWithDateFormatter } from "src/components";
import { TableLayout } from "src/components/Table/TableLayout";
import { intl, T } from "src/locale";
import { ACCESS_LISTS, MANAGE } from "src/modules/Permissions";

interface Props {
	data: AccessList[];
	isFiltered?: boolean;
	isFetching?: boolean;
	onEdit?: (id: number) => void;
	onDelete?: (id: number) => void;
	onNew?: () => void;
}
export default function Table({ data, isFetching, isFiltered, onEdit, onDelete, onNew }: Props) {
	const columnHelper = createColumnHelper<AccessList>();
	const columns = useMemo(
		() => [
			columnHelper.accessor((row: any) => row.owner, {
				id: "owner",
				cell: (info: any) => {
					const value = info.getValue();
					return <GravatarFormatter url={value ? value.avatar : ""} name={value ? value.name : ""} />;
				},
				meta: {
					className: "w-1",
				},
			}),
			columnHelper.accessor((row: any) => row, {
				id: "name",
				header: intl.formatMessage({ id: "column.name" }),
				cell: (info: any) => (
					<ValueWithDateFormatter value={info.getValue().name} createdOn={info.getValue().createdOn} />
				),
			}),
			columnHelper.accessor((row: any) => row.items, {
				id: "items",
				header: intl.formatMessage({ id: "column.authorization" }),
				cell: (info: any) => <T id="access-list.auth-count" data={{ count: info.getValue().length }} />,
			}),
			columnHelper.accessor((row: any) => row.clients, {
				id: "clients",
				header: intl.formatMessage({ id: "column.access" }),
				cell: (info: any) => <T id="access-list.access-count" data={{ count: info.getValue().length }} />,
			}),
			columnHelper.accessor((row: any) => row.satisfyAny, {
				id: "satisfyAny",
				header: intl.formatMessage({ id: "column.satisfy" }),
				cell: (info: any) => <T id={info.getValue() ? "column.satisfy-any" : "column.satisfy-all"} />,
			}),
			columnHelper.accessor((row: any) => row.proxyHostCount, {
				id: "proxyHostCount",
				header: intl.formatMessage({ id: "proxy-hosts" }),
				cell: (info: any) => <T id="proxy-hosts.count" data={{ count: info.getValue() }} />,
			}),
			columnHelper.display({
				id: "id",
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
									<T
										id="object.actions-title"
										tData={{ object: "access-list" }}
										data={{ id: info.row.original.id }}
									/>
								</span>
								<a
									className="dropdown-item"
									href="#"
									onClick={(e) => {
										e.preventDefault();
										onEdit?.(info.row.original.id);
									}}
								>
									<IconEdit size={16} />
									<T id="action.edit" />
								</a>
								<HasPermission section={ACCESS_LISTS} permission={MANAGE} hideError>
									<div className="dropdown-divider" />
									<a
										className="dropdown-item"
										href="#"
										onClick={(e) => {
											e.preventDefault();
											onDelete?.(info.row.original.id);
										}}
									>
										<IconTrash size={16} />
										<T id="action.delete" />
									</a>
								</HasPermission>
							</div>
						</span>
					);
				},
				meta: {
					className: "text-end w-1",
				},
			}),
		],
		[columnHelper, onEdit, onDelete],
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

	return (
		<TableLayout
			tableInstance={tableInstance}
			emptyState={
				<EmptyData
					object="access-list"
					objects="access-lists"
					tableInstance={tableInstance}
					onNew={onNew}
					isFiltered={isFiltered}
					color="cyan"
					permissionSection={ACCESS_LISTS}
				/>
			}
		/>
	);
}
