import {
	IconDotsVertical,
	IconEdit,
	IconFileCode,
	IconPower,
	IconTrash,
} from "@tabler/icons-react";
import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import type { OidcProviderConfig } from "src/api/backend";
import { TrueFalseFormatter } from "src/components";
import { TableLayout } from "src/components/Table/TableLayout";
import { intl, T } from "src/locale";

interface Props {
	data: OidcProviderConfig[];
	isFetching?: boolean;
	onEdit: (index: number) => void;
	onDelete: (index: number) => void;
	onToggleEnabled: (index: number) => void;
}

export default function OidcProviderTable({
	data,
	isFetching,
	onEdit,
	onDelete,
	onToggleEnabled,
}: Props) {
	const columnHelper = createColumnHelper<OidcProviderConfig>();

	const columns = useMemo(
		() => [
			columnHelper.accessor((row) => row, {
				id: "name",
				header: intl.formatMessage({ id: "column.name" }),
				cell: (info) => {
					const provider = info.getValue();
					const isFileBased = provider.source === "file";
					const baseUrl = provider.discoveryUrl
						?.replace(/\/\.well-known\/openid-configuration\/?$/i, "")
						|| provider.discoveryUrl;
					return (
						<div>
							<span className="d-flex align-items-center gap-2">
								{provider.name ? (
									<span>{provider.name}</span>
								) : (
									<em className="text-secondary">
										<T id="settings.oidc.provider-name" />
									</em>
								)}
								{isFileBased && (
									<span
										className="badge bg-blue-lt d-inline-flex align-items-center gap-1"
										title={intl.formatMessage({ id: "settings.oidc.source.file.tooltip" })}
									>
										<IconFileCode size={12} />
										<T id="settings.oidc.source.file" />
									</span>
								)}
							</span>
							{baseUrl && (
								<div className="text-secondary small text-truncate" style={{ maxWidth: "280px" }}>
									{baseUrl}
								</div>
							)}
						</div>
					);
				},
			}),
			columnHelper.accessor((row) => row.id, {
				id: "id",
				header: intl.formatMessage({ id: "settings.oidc.provider-id" }),
				cell: (info) => (
					<code className="text-secondary">{info.getValue()}</code>
				),
			}),
			columnHelper.accessor((row) => row.enabled, {
				id: "enabled",
				header: intl.formatMessage({ id: "column.status" }),
				cell: (info) => <TrueFalseFormatter value={info.getValue()} />,
			}),
			columnHelper.display({
				id: "actions",
				cell: (info) => {
					const index = info.row.index;
					const provider = info.row.original;
					const isFileBased = provider.source === "file";

					if (isFileBased) {
						// File-sourced providers are read-only — show only an informational indicator
						return (
							<span
								className="text-secondary d-flex align-items-center justify-content-end gap-1"
								title={intl.formatMessage({ id: "settings.oidc.source.file.tooltip" })}
							>
								<IconFileCode size={16} />
							</span>
						);
					}

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
									{provider.name || intl.formatMessage({ id: "settings.oidc.provider-name" })}
								</span>
								<a
									className="dropdown-item"
									href="#"
									onClick={(e) => {
										e.preventDefault();
										onEdit(index);
									}}
								>
									<IconEdit size={16} />
									<T id="action.edit" />
								</a>
								<a
									className="dropdown-item"
									href="#"
									onClick={(e) => {
										e.preventDefault();
										onToggleEnabled(index);
									}}
								>
									<IconPower size={16} />
									<T id={provider.enabled ? "action.disable" : "action.enable"} />
								</a>
								<div className="dropdown-divider" />
								<a
									className="dropdown-item"
									href="#"
									onClick={(e) => {
										e.preventDefault();
										onDelete(index);
									}}
								>
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
		[columnHelper, onEdit, onDelete, onToggleEnabled],
	);

	const tableInstance = useReactTable<OidcProviderConfig>({
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
				<tr>
					<td colSpan={tableInstance.getVisibleFlatColumns().length}>
						<div className="text-center text-secondary py-4">
							<T id="settings.oidc.no-providers" />
						</div>
					</td>
				</tr>
			}
		/>
	);
}
