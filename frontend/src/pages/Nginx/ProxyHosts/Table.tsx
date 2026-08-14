import {
	IconActivity,
	IconDotsVertical,
	IconEdit,
	IconFileText,
	IconLoadBalancer,
	IconPower,
	IconServer,
	IconTrash,
} from "@tabler/icons-react";
import {
	createColumnHelper,
	getCoreRowModel,
	getSortedRowModel,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import type { ProxyHost, ProxyTarget, Upstream } from "src/api/backend";
import {
	AccessListFormatter,
	CertificateFormatter,
	DomainsFormatter,
	EmptyData,
	GravatarFormatter,
	HasPermission,
} from "src/components";
import { TableLayout } from "src/components/Table/TableLayout";
import { intl, T } from "src/locale";
import { MANAGE, PROXY_HOSTS } from "src/modules/Permissions";

type MonitoringStatus = "disabled" | "unknown" | "online" | "degraded" | "offline" | "config_error";

const monitoringStatus = (host: ProxyHost): MonitoringStatus => {
	const status = host.monitoringStatus?.status;
	if (["disabled", "unknown", "online", "degraded", "offline", "config_error"].includes(status || "")) {
		return status as MonitoringStatus;
	}
	return host.enabled ? "unknown" : "disabled";
};

const monitoringStatusMessageId = (status: MonitoringStatus) => `proxy-host.monitoring.status.${status}`;

const defaultTarget = (host: ProxyHost): ProxyTarget =>
	host.defaultTarget || {
		type: "direct",
		scheme: host.forwardScheme as "http" | "https",
		host: host.forwardHost,
		port: host.forwardPort,
	};

interface Props {
	data: ProxyHost[];
	upstreams?: Upstream[];
	isFiltered?: boolean;
	isFetching?: boolean;
	onEdit?: (id: number) => void;
	onLogs?: (id: number) => void;
	onMonitoring?: (id: number) => void;
	onDelete?: (id: number) => void;
	onDisableToggle?: (id: number, enabled: boolean) => void;
	onNew?: () => void;
}
export default function Table({
	data,
	upstreams,
	isFetching,
	onEdit,
	onLogs,
	onMonitoring,
	onDelete,
	onDisableToggle,
	onNew,
	isFiltered,
}: Props) {
	const columnHelper = createColumnHelper<ProxyHost>();
	const upstreamById = useMemo(
		() => new Map((upstreams || []).map((upstream) => [upstream.id, upstream] as const)),
		[upstreams],
	);
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
					const targetSortValue = (host: ProxyHost) => {
						const target = defaultTarget(host);
						if (target.type === "upstream") {
							const upstream = upstreamById.get(target.upstreamId);
							return `upstream:${upstream?.name || upstream?.nginxKey || target.upstreamId}`;
						}
						return `direct:${target.scheme}://${target.host}:${target.port}`;
					};
					return targetSortValue(a.original).localeCompare(targetSortValue(b.original));
				},
				cell: (info: any) => {
					const host = info.getValue() as ProxyHost;
					const target = defaultTarget(host);
					if (target.type === "upstream") {
						const upstream = upstreamById.get(target.upstreamId);
						return (
							<div className="d-flex align-items-center gap-2 text-break">
								<span className="badge bg-blue-lt text-blue d-inline-flex align-items-center gap-1 flex-shrink-0">
									<IconLoadBalancer size={14} aria-hidden="true" />
									<T id="proxy-host.target.upstream" />
								</span>
								<div className="lh-sm">
									<div className="fw-semibold">
										{upstream?.name || (
											<T id="proxy-host.target.upstream-id" data={{ id: target.upstreamId }} />
										)}
									</div>
									<div className="text-secondary small font-monospace">
										{upstream?.nginxKey || `#${target.upstreamId}`} · {target.scheme.toUpperCase()}
									</div>
								</div>
							</div>
						);
					}
					return (
						<div className="d-flex align-items-center gap-2 text-break">
							<span className="badge bg-azure-lt text-azure d-inline-flex align-items-center gap-1 flex-shrink-0">
								<IconServer size={14} aria-hidden="true" />
								<T id="proxy-host.target.direct" />
							</span>
							<code>
								{target.scheme}://{target.host}:{target.port}
							</code>
						</div>
					);
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
					const host = info.row.original as ProxyHost;
					const status = monitoringStatus(host);
					return (
						<div className="text-end">
							<div className="d-flex justify-content-end align-items-center gap-0">
								<span
									className={`status monitoring-status-indicator monitoring-status-indicator-${status}`}
								>
									<span className="status-dot status-dot-animated" />
									<T id={monitoringStatusMessageId(status)} />
								</span>
								{onMonitoring ? (
									<button
										type="button"
										className="btn btn-action btn-sm p-1"
										title={intl.formatMessage({
											id: "proxy-host.monitoring.action",
											defaultMessage: "Monitoring",
										})}
										aria-label={intl.formatMessage({
											id: "proxy-host.monitoring.action",
											defaultMessage: "Monitoring",
										})}
										onClick={() => onMonitoring(info.row.original.id)}
									>
										<IconActivity size={16} />
									</button>
								) : null}
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
		[columnHelper, onEdit, onLogs, onMonitoring, onDisableToggle, onDelete, upstreamById],
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
