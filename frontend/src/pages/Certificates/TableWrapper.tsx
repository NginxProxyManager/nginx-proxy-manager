import { IconAlertTriangle, IconHelp, IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { deleteCertificate, deleteUnusedExpiredCertificates, downloadCertificate } from "src/api/backend";
import type { Certificate } from "src/api/backend";
import { Button, HasPermission, LoadingPage } from "src/components";
import { useCertificates } from "src/hooks";
import { intl, T } from "src/locale";
import {
	showCustomCertificateModal,
	showDeleteConfirmModal,
	showDNSCertificateModal,
	showHelpModal,
	showHTTPCertificateModal,
	showRenewCertificateModal,
} from "src/modals";
import { CERTIFICATES, MANAGE } from "src/modules/Permissions";
import { showError, showObjectSuccess, showSuccess } from "src/notifications";
import Table from "./Table";

export default function TableWrapper() {
	const [search, setSearch] = useState("");
	const { isFetching, isLoading, isError, error, data } = useCertificates([
		"owner",
		"dead_hosts",
		"proxy_hosts",
		"redirection_hosts",
		"streams",
	]);

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;
	}

	const handleDelete = async (id: number) => {
		await deleteCertificate(id);
		showObjectSuccess("certificate", "deleted");
	};

	const handleDownload = async (id: number) => {
		try {
			await downloadCertificate(id);
		} catch (err: any) {
			showError(err.message);
		}
	};

	const isUnusedExpired = (certificate: Certificate) => {
		const expiresAt = Date.parse(certificate.expiresOn);
		const isExpired = !Number.isNaN(expiresAt) && expiresAt <= Date.now();
		const isInUse =
			(certificate.proxyHosts?.length ?? 0) > 0 ||
			(certificate.redirectionHosts?.length ?? 0) > 0 ||
			(certificate.deadHosts?.length ?? 0) > 0 ||
			(certificate.streams?.length ?? 0) > 0;

		return isExpired && !isInUse;
	};

	const unusedExpiredCertificates = (data ?? []).filter(isUnusedExpired);

	const handleDeleteUnusedExpired = async () => {
		const result = await deleteUnusedExpiredCertificates();
		if (result.deletedCount > 0) {
			showSuccess(
				intl.formatMessage(
					{ id: "certificates.bulk-delete.success" },
					{ count: result.deletedCount },
				),
			);
		} else {
			showSuccess(intl.formatMessage({ id: "certificates.bulk-delete.none" }));
		}
	};

	let filtered = null;
	if (search && data) {
		filtered = data?.filter(
			(item: Certificate) =>
				item.domainNames.some((domain: string) => domain.toLowerCase().includes(search)) ||
				item.niceName.toLowerCase().includes(search),
		);
	} else if (search !== "") {
		// this can happen if someone deletes the last item while searching
		setSearch("");
	}

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-pink" />
			<div className="card-table">
				<div className="card-header">
					<div className="row w-full">
						<div className="col">
							<h2 className="mt-1 mb-0">
								<T id="certificates" />
							</h2>
						</div>
						<div className="col-md-auto col-sm-12">
							<div className="ms-auto d-flex flex-wrap btn-list">
								{data?.length ? (
									<div className="input-group input-group-flat w-auto">
										<span className="input-group-text input-group-text-sm">
											<IconSearch size={16} />
										</span>
										<input
											id="advanced-table-search"
											type="text"
											className="form-control form-control-sm"
											autoComplete="off"
											onChange={(e: any) => setSearch(e.target.value.toLowerCase().trim())}
										/>
									</div>
								) : null}
								<Button size="sm" onClick={() => showHelpModal("Certificates", "pink")}>
									<IconHelp size={20} />
								</Button>
								<HasPermission section={CERTIFICATES} permission={MANAGE} hideError>
									{unusedExpiredCertificates.length ? (
										<Button
											size="sm"
											variant="outline"
											className="mt-1"
											onClick={() =>
												showDeleteConfirmModal({
													title: <T id="certificates.bulk-delete.title" />,
													onConfirm: handleDeleteUnusedExpired,
													invalidations: [["certificates"]],
													children: (
														<div className="text-start">
															<div className="d-flex align-items-center text-danger fw-bold mb-2">
																<IconAlertTriangle size={18} className="me-2" />
																<span>
																	<T id="certificates.bulk-delete.warning" />
																</span>
															</div>
															<div className="mb-2">
																<T id="certificates.bulk-delete.list-title" />
															</div>
															<ul className="mb-0 ps-3" style={{ maxHeight: "180px", overflowY: "auto" }}>
																{unusedExpiredCertificates.map((certificate) => (
																	<li key={certificate.id}>
																		{certificate.niceName || certificate.domainNames.join(", ")}
																	</li>
																))}
															</ul>
														</div>
													),
												})
											}
										>
											<T
												id="certificates.bulk-delete.button"
												data={{ count: unusedExpiredCertificates.length }}
											/>
										</Button>
									) : null}
									{data?.length ? (
										<div className="dropdown">
											<button
												type="button"
												className="btn btn-sm dropdown-toggle btn-pink mt-1"
												data-bs-toggle="dropdown"
											>
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
									) : null}
								</HasPermission>
							</div>
						</div>
					</div>
				</div>
				<Table
					data={filtered ?? data ?? []}
					isFiltered={!!search}
					isFetching={isFetching}
					onRenew={showRenewCertificateModal}
					onDownload={handleDownload}
					onDelete={(id: number) =>
						showDeleteConfirmModal({
							title: <T id="object.delete" tData={{ object: "certificate" }} />,
							onConfirm: () => handleDelete(id),
							invalidations: [["certificates"], ["certificate", id]],
							children: <T id="object.delete.content" tData={{ object: "certificate" }} />,
						})
					}
				/>
			</div>
		</div>
	);
}
