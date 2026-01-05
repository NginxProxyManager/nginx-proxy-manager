import { IconDotsVertical, IconDownload, IconEdit, IconFlask, IconRefresh, IconTrash } from "@tabler/icons-react";
import { createColumnHelper, getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import type { Certificate } from "src/api/backend";
import {
	CertificateInUseFormatter,
	DateFormatter,
	DomainsFormatter,
	EmptyData,
	GravatarFormatter,
	HasPermission,
} from "src/components";
import { TableLayout } from "src/components/Table/TableLayout";
import { intl, T } from "src/locale";
import { showCustomCertificateModal, showDNSCertificateModal, showHTTPCertificateModal } from "src/modals";
import { CERTIFICATES, MANAGE } from "src/modules/Permissions";

interface Props {
	data: Certificate[];
	isFiltered?: boolean;
	isFetching?: boolean;
	onDelete?: (id: number) => void;
	onRenew?: (id: number) => void;
	onDownload?: (id: number) => void;
	onTest?: (domains: string[]) => void;
	onEdit?: (cert: Certificate) => void;
}

export default function Table({ data, isFetching, onDelete, onRenew, onDownload, onTest, onEdit, isFiltered }: Props) {
	const columnHelper = createColumnHelper<Certificate>();
	const columns = useMemo(
		() => [
			columnHelper.accessor((row: any) => row.owner.name, {
				id: "owner",
				cell: (info: any) => {
					const value = info.row.original.owner;
					return <GravatarFormatter url={value ? value.avatar : ""} name={value ? value.name : ""} />;
				},
				meta: {
					className: "w-1",
				},
			}),
			columnHelper.accessor((row: any) => row.domainNames.join(", "), {
				id: "domainNames",
				header: intl.formatMessage({ id: "column.name" }),
				cell: (info: any) => {
					const value = info.row.original;
					return (
						<DomainsFormatter
							domains={value.domainNames}
							createdOn={value.createdOn}
							niceName={value.niceName}
							provider={value.provider || ""}
						/>
					);
				},
			}),
			columnHelper.accessor(
				(row: any) => (row.meta?.dnsProvider ? `${row.provider} - ${row.meta.dnsProvider}` : row.provider),
				{
					id: "provider",
					header: intl.formatMessage({ id: "column.provider" }),
					cell: (info: any) => {
						const r = info.row.original;
						if (r.provider === "letsencrypt") {
							if (r.meta?.dnsChallenge && r.meta?.dnsProvider) {
								return (
									<>
										<T id="lets-encrypt" /> &ndash; {r.meta?.dnsProvider}
									</>
								);
							}
							return <T id="lets-encrypt" />;
						}
						if (r.provider === "other") {
							return <T id="certificates.custom" />;
						}
						return <T id={r.provider} />;
					},
				},
			),
			columnHelper.accessor((row: any) => row.expiresOn, {
				id: "expiresOn",
				header: intl.formatMessage({ id: "column.expires" }),
				cell: (info: any) => {
					return <DateFormatter value={info.getValue()} highlightPast />;
				},
			}),
			columnHelper.accessor(
				(row: any) =>
					(row.proxyHosts?.length || 0) +
						(row.redirectionHosts?.length || 0) +
						(row.deadHosts?.length || 0) +
						(row.streams?.length || 0) >
					0,
				{
					id: "proxyHosts",
					header: intl.formatMessage({ id: "column.status" }),
					cell: (info: any) => {
						const r = info.row.original;
						return (
							<CertificateInUseFormatter
								proxyHosts={r.proxyHosts}
								redirectionHosts={r.redirectionHosts}
								deadHosts={r.deadHosts}
								streams={r.streams}
							/>
						);
					},
				},
			),
			columnHelper.display({
				id: "id",
				cell: (info: any) => {
					const row = info.row.original;
					const inUse =
						(row.proxyHosts?.length || 0) +
							(row.redirectionHosts?.length || 0) +
							(row.deadHosts?.length || 0) +
							(row.streams?.length || 0) >
						0;

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
										tData={{ object: "certificate" }}
										data={{ id: row.id }}
									/>
								</span>

								{row.provider === "letsencrypt" && !row.meta?.dnsProvider && (
									<a
										className="dropdown-item"
										href="#"
										onClick={(e) => {
											e.preventDefault();
											onTest?.(row.domainNames);
										}}
									>
										<IconFlask size={16} />
										<T id="test" />
									</a>
								)}

								<HasPermission section={CERTIFICATES} permission={MANAGE} hideError>
									{row.provider === "other" && (
										<a
											className="dropdown-item"
											href="#"
											onClick={(e) => {
												e.preventDefault();
												onEdit?.(row);
											}}
										>
											<IconEdit size={16} />
											<T id="action.edit" />
										</a>
									)}

									{row.provider === "letsencrypt" && (
										<a
											className="dropdown-item"
											href="#"
											onClick={(e) => {
												e.preventDefault();
												onRenew?.(row.id);
											}}
										>
											<IconRefresh size={16} />
											<T id="action.renew" />
										</a>
									)}

									<a
										className="dropdown-item"
										href="#"
										onClick={(e) => {
											e.preventDefault();
											onDownload?.(row.id);
										}}
									>
										<IconDownload size={16} />
										<T id="action.download" />
									</a>
									{!inUse && (
										<>
											<div className="dropdown-divider" />
											<a
												className="dropdown-item"
												href="#"
												onClick={(e) => {
													e.preventDefault();
													onDelete?.(row.id);
												}}
											>
												<IconTrash size={16} />
												<T id="action.delete" />
											</a>
										</>
									)}
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
		[columnHelper, onDelete, onRenew, onDownload, onTest, onEdit],
	);

	const tableInstance = useReactTable<Certificate>({
		columns,
		data,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		rowCount: data.length,
		meta: {
			isFetching,
		},
		enableSortingRemoval: false,
	});

	const customAddBtn = (
		<div className="dropdown">
			<button type="button" className="btn dropdown-toggle btn-pink my-3" data-bs-toggle="dropdown">
				<T id="object.add" tData={{ object: "certificate" }} />
			</button>
			<div className="dropdown-menu">
				<a
					className="dropdown-item"
					href="#"
					onClick={(e) => {
						e.preventDefault();
						showHTTPCertificateModal();
					}}
				>
					<T id="lets-encrypt-via-http" />
				</a>
				<a
					className="dropdown-item"
					href="#"
					onClick={(e) => {
						e.preventDefault();
						showDNSCertificateModal();
					}}
				>
					<T id="lets-encrypt-via-dns" />
				</a>
				<div className="dropdown-divider" />
				<a
					className="dropdown-item"
					href="#"
					onClick={(e) => {
						e.preventDefault();
						showCustomCertificateModal();
					}}
				>
					<T id="certificates.custom" />
				</a>
			</div>
		</div>
	);

	return (
		<TableLayout
			tableInstance={tableInstance}
			emptyState={
				<EmptyData
					object="certificate"
					objects="certificates"
					tableInstance={tableInstance}
					isFiltered={isFiltered}
					color="pink"
					customAddBtn={customAddBtn}
					permissionSection={CERTIFICATES}
				/>
			}
		/>
	);
}
