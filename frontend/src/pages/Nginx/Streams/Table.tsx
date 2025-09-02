import { IconDotsVertical, IconEdit, IconPower, IconTrash } from "@tabler/icons-react";
import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import type { Stream } from "src/api/backend";
import { CertificateFormatter, DomainsFormatter, GravatarFormatter, StatusFormatter } from "src/components";
import { TableLayout } from "src/components/Table/TableLayout";
import { intl } from "src/locale";
import Empty from "./Empty";

interface Props {
	data: Stream[];
	isFetching?: boolean;
}
export default function Table({ data, isFetching }: Props) {
	const columnHelper = createColumnHelper<Stream>();
	const columns = useMemo(
		() => [
			columnHelper.accessor((row: any) => row.owner, {
				id: "owner",
				cell: (info: any) => {
					const value = info.getValue();
					return <GravatarFormatter url={value.avatar} name={value.name} />;
				},
				meta: {
					className: "w-1",
				},
			}),
			columnHelper.accessor((row: any) => row, {
				id: "incomingPort",
				header: intl.formatMessage({ id: "column.incoming-port" }),
				cell: (info: any) => {
					const value = info.getValue();
					// Bit of a hack to reuse the DomainsFormatter component
					return <DomainsFormatter domains={[value.incomingPort]} createdOn={value.createdOn} />;
				},
			}),
			columnHelper.accessor((row: any) => row, {
				id: "forwardHttpCode",
				header: intl.formatMessage({ id: "column.destination" }),
				cell: (info: any) => {
					const value = info.getValue();
					return `${value.forwardingHost}:${value.forwardingPort}`;
				},
			}),
			columnHelper.accessor((row: any) => row, {
				id: "tcpForwarding",
				header: intl.formatMessage({ id: "column.protocol" }),
				cell: (info: any) => {
					const value = info.getValue();
					return (
						<>
							{value.tcpForwarding ? (
								<span className="badge badge-lg domain-name">
									{intl.formatMessage({ id: "streams.tcp" })}
								</span>
							) : null}
							{value.udpForwarding ? (
								<span className="badge badge-lg domain-name">
									{intl.formatMessage({ id: "streams.udp" })}
								</span>
							) : null}
						</>
					);
				},
			}),
			columnHelper.accessor((row: any) => row.certificate, {
				id: "certificate",
				header: intl.formatMessage({ id: "column.ssl" }),
				cell: (info: any) => {
					return <CertificateFormatter certificate={info.getValue()} />;
				},
			}),
			columnHelper.accessor((row: any) => row.enabled, {
				id: "enabled",
				header: intl.formatMessage({ id: "column.status" }),
				cell: (info: any) => {
					return <StatusFormatter enabled={info.getValue()} />;
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
											id: "streams.actions-title",
										},
										{ id: info.row.original.id },
									)}
								</span>
								<a className="dropdown-item" href="#">
									<IconEdit size={16} />
									{intl.formatMessage({ id: "action.edit" })}
								</a>
								<a className="dropdown-item" href="#">
									<IconPower size={16} />
									{intl.formatMessage({ id: "action.disable" })}
								</a>
								<div className="dropdown-divider" />
								<a className="dropdown-item" href="#">
									<IconTrash size={16} />
									{intl.formatMessage({ id: "action.delete" })}
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
		[columnHelper],
	);

	const tableInstance = useReactTable<Stream>({
		columns,
		data,
		getCoreRowModel: getCoreRowModel(),
		rowCount: data.length,
		meta: {
			isFetching,
		},
		enableSortingRemoval: false,
	});

	return <TableLayout tableInstance={tableInstance} emptyState={<Empty tableInstance={tableInstance} />} />;
}
