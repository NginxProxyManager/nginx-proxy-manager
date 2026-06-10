import { IconDotsVertical, IconEdit, IconPower, IconTrash } from "@tabler/icons-react";
import {
	createColumnHelper,
	getCoreRowModel,
	getSortedRowModel,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import type { ProxyHost, ProxyLocation } from "src/api/backend";
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
import { useUpstreamHosts } from "src/hooks";
import { intl, T } from "src/locale";
import { showUpstreamHostModal } from "src/modals";
import { MANAGE, PROXY_HOSTS } from "src/modules/Permissions";

// DestinationCell renders the "Destination" column. A proxy host can route
// at two levels: proxy-level (the whole host forwards via forwardHost:port
// or upstreamHostId), and per-location (each /path entry carries its own
// direct forward fields OR upstream_host_id). The cell shows the proxy-level
// destination on the first line and every custom location underneath, so
// operators can see at a glance how each path will be routed.
function DestinationCell({ host }: { host: ProxyHost }) {
	const { data: upstreams } = useUpstreamHosts();

	const proxyUpstreamId = host.upstreamHostId ?? 0;
	const allLocations = host.locations || [];

	// If `/` is itself a custom location, the proxy-level destination is
	// unreachable (every request matches a location override). Suppress it.
	const rootIsCovered = allLocations.some((l: ProxyLocation) => l.path === "/");

	const renderUpstreamLink = (upId: number, fallbackName?: string) => {
		const up = upstreams?.find((u) => u.id === upId);
		const name = up?.name ?? fallbackName ?? `upstream #${upId}`;
		return (
			<button
				type="button"
				className="btn btn-link btn-sm p-0 align-baseline"
				onClick={(e) => {
					e.preventDefault();
					showUpstreamHostModal(upId);
				}}
			>
				{name}
			</button>
		);
	};

	const proxyLine =
		proxyUpstreamId > 0
			? renderUpstreamLink(proxyUpstreamId, host.upstreamHost?.name)
			: `${host.forwardScheme}://${host.forwardHost}:${host.forwardPort}`;

	if (allLocations.length === 0) {
		// Plain proxy host with no custom locations — keep the cell tight.
		return <>{proxyLine}</>;
	}

	// With custom locations, every routing rule (including the proxy-level
	// default) is shown as `<path> → <destination>` so the listing reads
	// uniformly. The "/" line is suppressed when the user has defined an
	// explicit "/" location override.
	return (
		<div className="text-secondary small">
			{!rootIsCovered && (
				<div>
					<code>/</code>
					{" → "}
					{proxyLine}
				</div>
			)}
			{allLocations.map((loc: ProxyLocation, i: number) => {
				const upId = loc.upstreamHostId ?? 0;
				return (
					<div key={`${loc.path}-${i}`}>
						<code>{loc.path}</code>
						{" → "}
						{upId > 0 ? (
							renderUpstreamLink(upId)
						) : (
							<span>
								{loc.forwardScheme}://{loc.forwardHost}:{loc.forwardPort}
							</span>
						)}
					</div>
				);
			})}
		</div>
	);
}

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
					const aVal = a.original.domainNames?.[0] ?? "";
					const bVal = b.original.domainNames?.[0] ?? "";
					return aVal.localeCompare(bVal);
				},
				cell: (info: any) => {
					const value = info.getValue();
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
				cell: (info: any) => <DestinationCell host={info.getValue()} />,
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
