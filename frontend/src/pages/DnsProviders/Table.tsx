import { IconDotsVertical, IconEdit, IconTrash } from "@tabler/icons-react";
import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import type { DnsProvider } from "src/api/backend";
import { EmptyData, TrueFalseFormatter, ValueWithDateFormatter } from "src/components";
import { TableLayout } from "src/components/Table/TableLayout";
import { intl, T } from "src/locale";

interface Props {
	data: DnsProvider[];
	isFiltered?: boolean;
	isFetching?: boolean;
	onEdit?: (id: number) => void;
	onDelete?: (id: number) => void;
	onNew?: () => void;
}
export default function Table({ data, isFetching, isFiltered, onEdit, onDelete, onNew }: Props) {
	const columnHelper = createColumnHelper<DnsProvider>();
	const columns = useMemo(
		() => [
			columnHelper.accessor((row: any) => row, {
				id: "name",
				header: intl.formatMessage({ id: "column.name" }),
				cell: (info: any) => (
					<ValueWithDateFormatter value={info.getValue().name} createdOn={info.getValue().createdOn} />
				),
			}),
			columnHelper.accessor((row: any) => row.type, {
				id: "type",
				header: intl.formatMessage({ id: "column.provider" }),
				cell: (info: any) => <T id={`dns-providers.type.${info.getValue()}`} />,
			}),
			columnHelper.accessor((row: any) => row.defaultIp, {
				id: "defaultIp",
				header: intl.formatMessage({ id: "dns-providers.default-ip" }),
				cell: (info: any) => info.getValue(),
			}),
			columnHelper.accessor((row: any) => row.meta, {
				id: "status",
				header: intl.formatMessage({ id: "column.status" }),
				// Status is derived from meta.lastCheckOk, which the backend does not
				// yet persist. This column is forward-compatible and will render as
				// "—" for every row until a later backend task starts writing it.
				cell: (info: any) => {
					const meta = info.getValue() || {};
					if (typeof meta.lastCheckOk === "boolean") {
						return (
							<TrueFalseFormatter
								value={meta.lastCheckOk}
								trueLabel="dns-providers.status.ok"
								falseLabel="dns-providers.status.failed"
								trueColor="lime"
								falseColor="red"
							/>
						);
					}
					return <span className="text-secondary">&mdash;</span>;
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
										tData={{ object: "dns-provider" }}
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

	const tableInstance = useReactTable<DnsProvider>({
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
					object="dns-provider"
					objects="dns-providers"
					tableInstance={tableInstance}
					onNew={onNew}
					isFiltered={isFiltered}
					color="teal"
				/>
			}
		/>
	);
}
