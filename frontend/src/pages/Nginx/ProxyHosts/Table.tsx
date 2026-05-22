import { IconDotsVertical, IconEdit, IconPower, IconTrash } from "@tabler/icons-react";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { type ReactNode, useMemo } from "react";
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
import { TableHeader } from "src/components/Table/TableHeader";
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

// Ungrouped hosts (empty label) sort last; the rest sort alphabetically.
function compareGroupLabels(a: string, b: string): number {
	if (!a && b) return 1;
	if (a && !b) return -1;
	return a.localeCompare(b);
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

	// Sort hosts by group label so each group's rows are contiguous. The table's
	// row model (and any column-sort model layered on top) then drives the order
	// within each group, so column sorting works natively per group.
	const sortedData = useMemo(
		() => [...data].sort((a, b) => compareGroupLabels(a.hostGroupLabel || "", b.hostGroupLabel || "")),
		[data],
	);

	const tableInstance = useReactTable<ProxyHost>({
		columns,
		data: sortedData,
		getCoreRowModel: getCoreRowModel(),
		rowCount: sortedData.length,
		meta: {
			isFetching,
		},
		enableSortingRemoval: false,
	});

	const groupLabels = useMemo(() => {
		const labels = new Set<string>();
		for (const item of data) {
			labels.add(item.hostGroupLabel || "");
		}
		return labels;
	}, [data]);
	const hasMultipleGroups = groupLabels.size > 1 || (groupLabels.size === 1 && !groupLabels.has(""));
	const rows = tableInstance.getRowModel().rows;

	if (rows.length === 0) {
		return (
			<div className="table-responsive">
				<table className="table table-vcenter table-selectable mb-0">
					<tbody className="table-tbody">
						<EmptyData
							object="proxy-host"
							objects="proxy-hosts"
							tableInstance={tableInstance}
							onNew={onNew}
							isFiltered={isFiltered}
							color="lime"
							permissionSection={PROXY_HOSTS}
						/>
					</tbody>
				</table>
			</div>
		);
	}

	const colCount = tableInstance.getVisibleFlatColumns().length;

	// Walk the row model in order, emitting a group-header row whenever the
	// group label changes. Driving this off the row model (rather than the raw
	// data) keeps any column sorting applied to rows within each group.
	const bodyRows: ReactNode[] = [];
	let previousLabel: string | null = null;
	for (const row of rows) {
		const label = row.original.hostGroupLabel || "";
		if (hasMultipleGroups && label !== previousLabel) {
			bodyRows.push(
				<tr key={`group-header-${label}`}>
					<td
						colSpan={colCount}
						className="bg-light fw-bold text-muted px-3 py-2"
						style={{ fontSize: "0.8rem", letterSpacing: "0.03em" }}
					>
						{label || intl.formatMessage({ id: "ungrouped" })}
					</td>
				</tr>,
			);
		}
		previousLabel = label;
		bodyRows.push(
			<tr key={row.id}>
				{row.getVisibleCells().map((cell: any) => {
					const { className } = (cell.column.columnDef.meta as any) ?? {};
					return (
						<td key={cell.id} className={className}>
							{flexRender(cell.column.columnDef.cell, cell.getContext())}
						</td>
					);
				})}
			</tr>,
		);
	}

	return (
		<div className="table-responsive">
			<table className="table table-vcenter table-selectable mb-0">
				<TableHeader tableInstance={tableInstance} />
				<tbody className="table-tbody">{bodyRows}</tbody>
			</table>
		</div>
	);
}
