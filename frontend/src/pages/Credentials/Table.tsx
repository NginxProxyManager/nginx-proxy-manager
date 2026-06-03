import { IconDotsVertical, IconEdit, IconTrash } from "@tabler/icons-react";
import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import type { StoredCredential } from "src/api/backend/getCredentials";
import { EmptyData, HasPermission, ValueWithDateFormatter } from "src/components";
import { TableLayout } from "src/components/Table/TableLayout";
import { intl, T } from "src/locale";
import { CREDENTIALS, MANAGE } from "src/modules/Permissions";

interface Props {
	data: StoredCredential[];
	isFiltered?: boolean;
	isFetching?: boolean;
	onEdit: (item: StoredCredential) => void;
	onDelete: (id: number) => void;
	onNew: () => void;
}

export default function Table({ data, isFetching, isFiltered, onEdit, onDelete, onNew }: Props) {
	const columnHelper = createColumnHelper<StoredCredential>();
	const columns = useMemo(
		() => [
			columnHelper.accessor("name", {
				header: intl.formatMessage({ id: "column.name" }),
				cell: (info) => (
					<ValueWithDateFormatter value={info.getValue()} createdOn={info.row.original.createdOn} />
				),
			}),
			columnHelper.accessor("dnsProvider", {
				header: intl.formatMessage({ id: "certificates.dns.provider" }),
			}),
			columnHelper.accessor("lastUsedAt", {
				header: "Last used",
				cell: (info) => info.getValue() || "—",
			}),
			columnHelper.display({
				id: "actions",
				cell: (info) => (
					<span className="dropdown">
						<button
							type="button"
							className="btn dropdown-toggle btn-action btn-sm px-1"
							data-bs-toggle="dropdown"
						>
							<IconDotsVertical />
						</button>
						<div className="dropdown-menu dropdown-menu-end">
							<HasPermission section={CREDENTIALS} permission={MANAGE} hideError>
								<a className="dropdown-item" href="#" onClick={() => onEdit(info.row.original)}>
									<IconEdit className="icon dropdown-item-icon" />
									<T id="edit" />
								</a>
								<a
									className="dropdown-item text-danger"
									href="#"
									onClick={() => onDelete(info.row.original.id)}
								>
									<IconTrash className="icon dropdown-item-icon" />
									<T id="delete" />
								</a>
							</HasPermission>
						</div>
					</span>
				),
			}),
		],
		[onDelete, onEdit],
	);

	const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });

	if (!data.length) {
		return (
			<EmptyData
				object="credential"
				isFiltered={isFiltered}
				onNew={onNew}
				permissionSection={CREDENTIALS}
				permission={MANAGE}
			/>
		);
	}

	return <TableLayout table={table} isFetching={isFetching} />;
}
