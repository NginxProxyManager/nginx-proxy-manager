import { IconDotsVertical, IconEdit, IconFileText, IconPower, IconTrash } from "@tabler/icons-react";
import {
	createColumnHelper,
	getCoreRowModel,
	getSortedRowModel,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
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
	onLogs?: (id: number) => void;
	onDelete?: (id: number) => void;
	onDisableToggle?: (id: number, enabled: boolean) => void;
	onNew?: () => void;
}
export default function Table({
	data,
	isFetching,
	onEdit,
	onLogs,
	onDelete,
	onDisableToggle,
	onNew,
	isFiltered,
}: Props) {
	const columnHelper = createColumnHelper<ProxyHost>();
	const columns = useMemo(
		() => [
			columnHelper.accessor((row: any) => row.owner, {
				id: "owner",
				enableSorting: false,
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
				sortingFn: (a, b) => {
					const source = (host: ProxyHost) =>
						host.nginxConfig?.listener?.mode === "port"
							? `:${host.nginxConfig.listener.port ?? ""}`
							: (host.domainNames?.[0] ?? "");
					return source(a.original).localeCompare(source(b.original));
				},
				cell: (info: any) => {
					const value = info.getValue() as ProxyHost;
					if (value.nginxConfig?.listener?.mode === "port") {
						return (
							<span className="fw-semibold">
								<T id="proxy-host.wizard.listener.port-number" />: {value.nginxConfig.listener.port}
							</span>
						);
					}
					return <DomainsFormatter domains={value.domainNames} createdOn={value.createdOn} />;
				},
			}),
			columnHelper.accessor((row: any) => row, {
				id: "forwardHost",
				header: intl.formatMessage({ id: "column.destination" }),
				sortingFn: (a, b) => {
					const aVal = `${a.original.forwardHost}:${a.original.forwardPort}`;
					const bVal = `${b.original.forwardHost}:${b.original.forwardPort}`;
					return aVal.localeCompare(bVal);
				},
				cell: (info: any) => {
					const value = info.getValue();
					return `${value.forwardScheme}://${value.forwardHost}:${value.forwardPort}`;
				},
			}),
			columnHelper.accessor((row: any) => row.certificate, {
				id: "certificate",
				enableSorting: false,
				header: intl.formatMessage({ id: "column.ssl" }),
				cell: (info: any) => {
					return <CertificateFormatter certificate={info.getValue()} />;
				},
			}),
			columnHelper.accessor((row: any) => row.accessList, {
				id: "accessList",
				enableSorting: false,
				header: intl.formatMessage({ id: "column.access" }),
				cell: (info: any) => {
					return <AccessListFormatter access={info.getValue()} />;
				},
			}),
			columnHelper.accessor((row: any) => row.enabled, {
				id: "enabled",
				header: intl.formatMessage({ id: "column.status" }),
				cell: (info: any) => {
					const host = info.row.original;
					return (
						<div className="text-end">
							<div className="d-flex justify-content-end align-items-center gap-0">
								<TrueFalseFormatter value={info.getValue()} trueLabel="online" falseLabel="offline" />
								{onLogs ? (
									<button
										type="button"
										className="btn btn-action btn-sm p-1"
										title="Logs"
										aria-label="Logs"
										onClick={() => onLogs(info.row.original.id)}
									>
										<IconFileText size={16} />
									</button>
								) : null}
								<span className="dropdown ms-1">
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
												data={{ id: host.id }}
											/>
										</span>
										<a
											className="dropdown-item"
											href="#"
											onClick={(e) => {
												e.preventDefault();
												onEdit?.(host.id);
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
													onDisableToggle?.(host.id, !host.enabled);
												}}
											>
												<IconPower size={16} />
												<T id={host.enabled ? "action.disable" : "action.enable"} />
											</a>
											<div className="dropdown-divider" />
											<a
												className="dropdown-item"
												href="#"
												onClick={(e) => {
													e.preventDefault();
													onDelete?.(host.id);
												}}
											>
												<IconTrash size={16} />
												<T id="action.delete" />
											</a>
										</HasPermission>
									</div>
								</span>
							</div>
							{host.nginxDeploymentStatus && (
								<div className="small text-secondary">
									<T id="nginx-deployment.status" />:{" "}
									<T id={`nginx-deployment.status.${host.nginxDeploymentStatus}`} />
								</div>
							)}
						</div>
					);
				},
				meta: {
					className: "text-end",
				},
			}),
		],
		[columnHelper, onEdit, onLogs, onDisableToggle, onDelete],
	);

	const [sorting, setSorting] = useState<SortingState>([]);

	const tableInstance = useReactTable<ProxyHost>({
		columns,
		data,
		state: { sorting },
		onSortingChange: setSorting,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
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
