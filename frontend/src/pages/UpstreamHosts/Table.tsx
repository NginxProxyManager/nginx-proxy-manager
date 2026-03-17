import { IconDotsVertical, IconEdit, IconTrash } from "@tabler/icons-react";
import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import type { UpstreamHost } from "src/api/backend";
import { EmptyData, GravatarFormatter, HasPermission, ValueWithDateFormatter } from "src/components";
import { TableLayout } from "src/components/Table/TableLayout";
import { intl, T } from "src/locale";
import { MANAGE, UPSTREAM_HOSTS } from "src/modules/Permissions";

interface Props {
	data: UpstreamHost[];
	isFiltered?: boolean;
	isFetching?: boolean;
	onEdit?: (id: number) => void;
	onDelete?: (id: number) => void;
	onNew?: () => void;
}
export default function Table({ data, isFetching, isFiltered, onEdit, onDelete, onNew }: Props) {
	const columnHelper = createColumnHelper<UpstreamHost>();
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
			columnHelper.accessor((row: any) => row.forwardScheme, {
				id: "forwardScheme",
				header: intl.formatMessage({ id: "column.scheme" }),
				cell: (info: any) => info.getValue(),
			}),
			columnHelper.accessor((row: any) => row.method, {
				id: "method",
				header: intl.formatMessage({ id: "upstream-host.method" }),
				cell: (info: any) => {
					const method = info.getValue();
					return method?.replace(/_/g, " ") || "";
				},
			}),
			columnHelper.accessor((row: any) => row.servers, {
				id: "servers",
				header: intl.formatMessage({ id: "upstream-host.servers" }),
				cell: (info: any) => {
					const servers = info.getValue();
					return servers?.length || 0;
				},
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
										tData={{ object: "upstream-host" }}
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
								<HasPermission section={UPSTREAM_HOSTS} permission={MANAGE} hideError>
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

	const tableInstance = useReactTable<UpstreamHost>({
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
					object="upstream-host"
					objects="upstream-hosts"
					tableInstance={tableInstance}
					onNew={onNew}
					isFiltered={isFiltered}
					color="teal"
					permissionSection={UPSTREAM_HOSTS}
				/>
			}
		/>
	);
}
