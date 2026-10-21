import { IconDotsVertical, IconEdit, IconPower, IconTrash } from "@tabler/icons-react";
import { createColumnHelper, useTable } from "@tanstack/react-table";
import { useMemo } from "react";
import { type SingleSignOnClient, SingleSignOnClientType } from "src/api/backend";
import { EmptyData, TrueFalseFormatter, ValueWithDateFormatter } from "src/components";
import { type Features, features } from "src/components/Table/features";
import { SingleSignOnProtocolFormatter } from "src/components/Table/Formatter/SingleSignOnProtocolFormatter";
import { TableLayout } from "src/components/Table/TableLayout";
import { intl, T } from "src/locale";
import { showSingleSignOnClientModal } from "src/modals";

interface Props {
	data: SingleSignOnClient[];
	isFiltered?: boolean;
	isFetching?: boolean;
	currentUserId?: number;
	onEdit?: (id: number, type: SingleSignOnClientType) => void;
	onDelete?: (id: number) => void;
	onDisableToggle?: (id: number, enabled: boolean) => void;
	onNew?: () => void;
}
export default function Table({ data, onEdit, isFiltered, isFetching, onDisableToggle, onDelete }: Props) {
	const columnHelper = createColumnHelper<Features, SingleSignOnClient>();
	const columns = useMemo(
		() => [
			columnHelper.accessor((row: any) => row.clientType, {
				id: "protocol",
				cell: (info: any) => {
					const value = info.getValue();

					return <SingleSignOnProtocolFormatter protocol={value} />;
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
			columnHelper.accessor((row: any) => row.enabled, {
				id: "enabled",
				header: intl.formatMessage({ id: "column.status" }),
				cell: (info: any) => {
					return <TrueFalseFormatter value={!!info.getValue()} />;
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
										tData={{ object: "sso-client" }}
										data={{ id: info.row.original.id }}
									/>
								</span>
								<a
									className="dropdown-item"
									href="#"
									onClick={(e) => {
										e.preventDefault();
										onEdit?.(info.row.original.id, info.row.original.clientType);
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

	const tableInstance = useTable({
		features,
		columns,
		data,
		meta: {
			isFetching,
		},
		enableSortingRemoval: false,
	});

	const customAddBtn = (
		<div className="dropdown">
			<button type="button" className="btn dropdown-toggle btn-teal my-3" data-bs-toggle="dropdown">
				<T id="object.add" tData={{ object: "sso-client" }} />
			</button>
			<div className="dropdown-menu">
				<a
					className="dropdown-item"
					href="#"
					onClick={(e) => {
						e.preventDefault();
						showSingleSignOnClientModal("new_openid", SingleSignOnClientType.OpenID);
					}}
				>
					<T id="sso-client-oauth2-openid" />
				</a>
				<a
					className="dropdown-item"
					href="#"
					onClick={(e) => {
						e.preventDefault();
						showSingleSignOnClientModal("new_saml", SingleSignOnClientType.SAML);
					}}
				>
					<T id="sso-client-saml" />
				</a>
			</div>
		</div>
	);

	return (
		<TableLayout
			tableInstance={tableInstance}
			emptyState={
				<EmptyData
					object="sso-client"
					objects="sso-clients"
					tableInstance={tableInstance}
					customAddBtn={customAddBtn}
					isFiltered={isFiltered}
					color="teal"
				/>
			}
		/>
	);
}
