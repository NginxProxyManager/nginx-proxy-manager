import {
	IconDotsVertical,
	IconEdit,
	IconLock,
	IconLogin2,
	IconPower,
	IconShield,
	IconTrash,
} from "@tabler/icons-react";
import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import type { User } from "src/api/backend";
import {
	EmailFormatter,
	EmptyData,
	GravatarFormatter,
	RolesFormatter,
	TrueFalseFormatter,
	ValueWithDateFormatter,
} from "src/components";
import { TableLayout } from "src/components/Table/TableLayout";
import { intl, T } from "src/locale";

interface Props {
	data: User[];
	isFiltered?: boolean;
	isFetching?: boolean;
	currentUserId?: number;
	onEditUser?: (id: number) => void;
	onEditPermissions?: (id: number) => void;
	onSetPassword?: (id: number) => void;
	onDeleteUser?: (id: number) => void;
	onDisableToggle?: (id: number, enabled: boolean) => void;
	onNewUser?: () => void;
	onLoginAs?: (id: number) => void;
}
export default function Table({
	data,
	isFiltered,
	isFetching,
	currentUserId,
	onEditUser,
	onEditPermissions,
	onSetPassword,
	onDeleteUser,
	onDisableToggle,
	onNewUser,
	onLoginAs,
}: Props) {
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
					return (
						<ValueWithDateFormatter
							value={value.name}
							createdOn={value.createdOn}
							disabled={value.isDisabled}
						/>
					);
				},
			}),
			columnHelper.accessor((row: any) => row.email, {
				id: "email",
				header: intl.formatMessage({ id: "column.email" }),
				cell: (info: any) => {
					return <EmailFormatter email={info.getValue()} />;
				},
			}),
			columnHelper.accessor((row: any) => row.roles, {
				id: "roles",
				header: intl.formatMessage({ id: "column.roles" }),
				cell: (info: any) => {
					return <RolesFormatter roles={info.getValue()} />;
				},
			}),
			columnHelper.accessor((row: any) => row.isDisabled, {
				id: "isDisabled",
				header: intl.formatMessage({ id: "column.status" }),
				cell: (info: any) => {
					return <TrueFalseFormatter value={!info.getValue()} />;
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
										tData={{ object: "user" }}
										data={{ id: info.row.original.id }}
									/>
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
									<T id="action.edit" />
								</a>
								{currentUserId !== info.row.original.id ? (
									<>
										<a
											className="dropdown-item"
											href="#"
											onClick={(e) => {
												e.preventDefault();
												onEditPermissions?.(info.row.original.id);
											}}
										>
											<IconShield size={16} />
											<T id="action.permissions" />
										</a>
										<a
											className="dropdown-item"
											href="#"
											onClick={(e) => {
												e.preventDefault();
												onSetPassword?.(info.row.original.id);
											}}
										>
											<IconLock size={16} />
											<T id="user.set-password" />
										</a>
										<a
											className="dropdown-item"
											href="#"
											onClick={(e) => {
												e.preventDefault();
												onDisableToggle?.(info.row.original.id, info.row.original.isDisabled);
											}}
										>
											<IconPower size={16} />
											<T id={info.row.original.isDisabled ? "action.enable" : "action.disable"} />
										</a>
										{info.row.original.isDisabled ? (
											<div className="dropdown-item text-muted">
												<IconLogin2 size={16} />
												<T id="user.login-as" data={{ name: info.row.original.name }} />
											</div>
										) : (
											<a
												className="dropdown-item"
												href="#"
												onClick={(e) => {
													e.preventDefault();
													onLoginAs?.(info.row.original.id);
												}}
											>
												<IconLogin2 size={16} />
												<T id="user.login-as" data={{ name: info.row.original.name }} />
											</a>
										)}
										<div className="dropdown-divider" />
										<a
											className="dropdown-item"
											href="#"
											onClick={(e) => {
												e.preventDefault();
												onDeleteUser?.(info.row.original.id);
											}}
										>
											<IconTrash size={16} />
											<T id="action.delete" />
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
		[
			columnHelper,
			currentUserId,
			onEditUser,
			onDisableToggle,
			onDeleteUser,
			onEditPermissions,
			onSetPassword,
			onLoginAs,
		],
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
			emptyState={
				<EmptyData
					object="user"
					objects="users"
					tableInstance={tableInstance}
					onNew={onNewUser}
					isFiltered={isFiltered}
					color="orange"
				/>
			}
		/>
	);
}
