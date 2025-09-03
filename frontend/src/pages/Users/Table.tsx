import { IconDotsVertical, IconEdit, IconLock, IconShield, IconTrash } from "@tabler/icons-react";
import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import type { User } from "src/api/backend";
import { GravatarFormatter, ValueWithDateFormatter } from "src/components";
import { TableLayout } from "src/components/Table/TableLayout";
import { intl } from "src/locale";
import Empty from "./Empty";

interface Props {
	data: User[];
	isFetching?: boolean;
	currentUserId?: number;
	onEditUser?: (id: number) => void;
	onNewUser?: () => void;
}
export default function Table({ data, isFetching, currentUserId, onEditUser, onNewUser }: Props) {
	const columnHelper = createColumnHelper<User>();
	const columns = useMemo(
		() => [
			columnHelper.accessor((row: any) => row, {
				id: "avatar",
				cell: (info: any) => {
					const value = info.getValue();
					return <GravatarFormatter url={value.avatar} name={value.name} />;
				},
				meta: {
					className: "w-1",
				},
			}),
			columnHelper.accessor((row: any) => row, {
				id: "name",
				header: intl.formatMessage({ id: "column.name" }),
				cell: (info: any) => {
					const value = info.getValue();
					// Hack to reuse domains formatter
					return <ValueWithDateFormatter value={value.name} createdOn={value.createdOn} />;
				},
			}),
			columnHelper.accessor((row: any) => row.email, {
				id: "email",
				header: intl.formatMessage({ id: "column.email" }),
				cell: (info: any) => {
					return info.getValue();
				},
			}),
			// TODO: formatter for roles
			columnHelper.accessor((row: any) => row.roles, {
				id: "roles",
				header: intl.formatMessage({ id: "column.roles" }),
				cell: (info: any) => {
					return JSON.stringify(info.getValue());
				},
			}),
			columnHelper.display({
				id: "id", // todo: not needed for a display?
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
									{intl.formatMessage(
										{
											id: "users.actions-title",
										},
										{ id: info.row.original.id },
									)}
								</span>
								<a
									className="dropdown-item"
									href="#"
									onClick={(e) => {
										e.preventDefault();
										onEditUser?.(info.row.original.id);
									}}
								>
									<IconEdit size={16} />
									{intl.formatMessage({ id: "user.edit" })}
								</a>
								<a className="dropdown-item" href="#">
									<IconShield size={16} />
									{intl.formatMessage({ id: "action.permissions" })}
								</a>
								<a className="dropdown-item" href="#">
									<IconLock size={16} />
									{intl.formatMessage({ id: "user.change-password" })}
								</a>
								{currentUserId !== info.row.original.id ? (
									<>
										<div className="dropdown-divider" />
										<a className="dropdown-item" href="#">
											<IconTrash size={16} />
											{intl.formatMessage({ id: "action.delete" })}
										</a>
									</>
								) : null}
							</div>
						</span>
					);
				},
				meta: {
					className: "text-end w-1",
				},
			}),
		],
		[columnHelper, currentUserId, onEditUser],
	);

	const tableInstance = useReactTable<User>({
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
			emptyState={<Empty tableInstance={tableInstance} onNewUser={onNewUser} />}
		/>
	);
}
