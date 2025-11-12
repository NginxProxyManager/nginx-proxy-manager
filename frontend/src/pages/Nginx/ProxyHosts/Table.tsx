import { IconDotsVertical, IconEdit, IconPower, IconTrash } from "@tabler/icons-react";
import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import type { ProxyHost } from "src/api/backend";
import {
	AccessListFormatter,
	CertificateFormatter,
	DomainsFormatter,
	EmptyData,
	GravatarFormatter,
	HasPermission,
	TrueFalseFormatter,
} from "src/components";
import { TableLayout } from "src/components/Table/TableLayout";
import { intl, T } from "src/locale";
import { MANAGE, PROXY_HOSTS } from "src/modules/Permissions";

interface Props {
	data: ProxyHost[];
	isFiltered?: boolean;
	isFetching?: boolean;
	onEdit?: (id: number) => void;
	onDelete?: (id: number) => void;
	onDisableToggle?: (id: number, enabled: boolean) => void;
	onNew?: () => void;
}
export default function Table({ data, isFetching, onEdit, onDelete, onDisableToggle, onNew, isFiltered }: Props) {
	const columnHelper = createColumnHelper<ProxyHost>();
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
				id: "domainNames",
				header: intl.formatMessage({ id: "column.source" }),
				cell: (info: any) => {
					const value = info.getValue();
					return <DomainsFormatter domains={value.domainNames} createdOn={value.createdOn} />;
				},
			}),
			columnHelper.accessor((row: any) => row, {
				id: "forwardHost",
				header: intl.formatMessage({ id: "column.destination" }),
				cell: (info: any) => {
					const value = info.getValue();
					return `${value.forwardScheme}://${value.forwardHost}:${value.forwardPort}`;
				},
			}),
			columnHelper.accessor((row: any) => row.certificate, {
				id: "certificate",
				header: intl.formatMessage({ id: "column.ssl" }),
				cell: (info: any) => {
					return <CertificateFormatter certificate={info.getValue()} />;
				},
			}),
			columnHelper.accessor((row: any) => row.accessList, {
				id: "accessList",
				header: intl.formatMessage({ id: "column.access" }),
				cell: (info: any) => {
					return <AccessListFormatter access={info.getValue()} />;
				},
			}),
			columnHelper.accessor((row: any) => row.enabled, {
				id: "enabled",
				header: intl.formatMessage({ id: "column.status" }),
				cell: (info: any) => {
					return <TrueFalseFormatter value={info.getValue()} trueLabel="online" falseLabel="offline" />;
				},
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
										tData={{ object: "proxy-host" }}
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
								<HasPermission section={PROXY_HOSTS} permission={MANAGE} hideError>
									<a
										className="dropdown-item"
										href="#"
										onClick={(e) => {
											e.preventDefault();
											onDisableToggle?.(info.row.original.id, !info.row.original.enabled);
										}}
									>
										<IconPower size={16} />
										<T id={info.row.original.enabled ? "action.disable" : "action.enable"} />
									</a>
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
		[columnHelper, onEdit, onDisableToggle, onDelete],
	);

	const tableInstance = useReactTable<ProxyHost>({
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
					object="proxy-host"
					objects="proxy-hosts"
					tableInstance={tableInstance}
					onNew={onNew}
					isFiltered={isFiltered}
					color="lime"
					permissionSection={PROXY_HOSTS}
				/>
			}
		/>
	);
}
