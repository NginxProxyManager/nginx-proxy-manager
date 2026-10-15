import { IconDotsVertical, IconEdit, IconTrash } from "@tabler/icons-react";
import { createColumnHelper, useTable } from "@tanstack/react-table";
import { useMemo } from "react";
import type { StoredCredential } from "src/api/backend/getCredentials";
import { EmptyData, HasPermission, ValueWithDateFormatter } from "src/components";
import { type Features, features } from "src/components/Table/features";
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
	const columns = useMemo(() => {
		const columnHelper = createColumnHelper<Features, StoredCredential>();
		return [
			columnHelper.accessor((row: any) => row.name, {
				id: "name",
				header: intl.formatMessage({ id: "column.name" }),
				cell: (info: any) => (
					<ValueWithDateFormatter value={info.getValue()} createdOn={info.row.original.createdOn} />
				),
			}),
			columnHelper.accessor((row: any) => row.dnsProvider, {
				id: "dnsProvider",
				header: intl.formatMessage({ id: "certificates.dns.provider" }),
			}),
			columnHelper.accessor((row: any) => row.lastUsedAt, {
				id: "lastUsedAt",
				header: "Last used",
				cell: (info: any) => info.getValue() || "—",
			}),
			columnHelper.display({
				id: "actions",
				cell: (info: any) => (
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
		];
	}, [onDelete, onEdit]);

	const tableInstance = useTable({
		features,
		columns,
		data,
		meta: {
			isFetching,
		},
	});

	return (
		<TableLayout
			tableInstance={tableInstance}
			emptyState={
				<EmptyData
					object="credential"
					objects="credentials"
					tableInstance={tableInstance}
					isFiltered={isFiltered}
					onNew={onNew}
					color="cyan"
					permissionSection={CREDENTIALS}
					permission={MANAGE}
				/>
			}
		/>
	);
}
