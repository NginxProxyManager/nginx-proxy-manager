import { IconHelp, IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { deleteCertificate, downloadCertificate, type Certificate } from "src/api/backend";
import { AgentSection, Button, HasPermission, LoadingPage } from "src/components";
import { type AgentTarget, useAgentTargets, useCertificates } from "src/hooks";
import { T } from "src/locale";
import {
	showCustomCertificateModal,
	showDeleteConfirmModal,
	showDNSCertificateModal,
	showHelpModal,
	showHTTPCertificateModal,
	showRenewCertificateModal,
} from "src/modals";
import { CERTIFICATES, MANAGE } from "src/modules/Permissions";
import { showError, showObjectSuccess } from "src/notifications";
import Table from "./Table";

const filterCertificates = (data: Certificate[], search: string) => {
	if (!search) return data;
	return data.filter(
		(item) =>
			item.domainNames.some((domain: string) => domain.toLowerCase().includes(search)) ||
			item.niceName.toLowerCase().includes(search),
	);
};

function AddCertificateDropdown({ target, size = "sm" }: { target: AgentTarget; size?: "sm" | undefined }) {
	return (
		<div className="dropdown">
			<button type="button" className={`btn ${size ? `btn-${size}` : ""} dropdown-toggle btn-pink`} data-bs-toggle="dropdown">
				<T id="object.add" tData={{ object: "certificate" }} />
			</button>
			<div className="dropdown-menu">
				<a
					className="dropdown-item"
					href="#"
					onClick={(e) => {
						e.preventDefault();
						showHTTPCertificateModal(target.id, target.name);
					}}
				>
					<T id="lets-encrypt-via-http" />
				</a>
				<a
					className="dropdown-item"
					href="#"
					onClick={(e) => {
						e.preventDefault();
						showDNSCertificateModal(target.id, target.name);
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
						showCustomCertificateModal(target.id, target.name);
					}}
				>
					<T id="certificates.custom" />
				</a>
			</div>
		</div>
	);
}

function CertificateAgentSection({ target, search }: { target: AgentTarget; search: string }) {
	const query = useCertificates(["owner", "dead_hosts", "proxy_hosts", "redirection_hosts", "streams"], {}, target.id);
	const data = query.data ?? [];
	const filtered = filterCertificates(data, search);

	const handleDelete = async (id: number) => {
		await deleteCertificate(id, target.id);
		showObjectSuccess("certificate", "deleted");
	};

	const handleDownload = async (id: number) => {
		try {
			await downloadCertificate(id, target.id);
		} catch (err: any) {
			showError(err.message);
		}
	};

	return (
		<AgentSection
			target={target}
			color="pink"
			isLoading={query.isLoading}
			isFetching={query.isFetching}
			isError={query.isError}
			error={query.error}
			shownCount={filtered.length}
			totalCount={data.length}
			onRetry={() => query.refetch()}
			actions={
				<HasPermission section={CERTIFICATES} permission={MANAGE} hideError>
					<AddCertificateDropdown target={target} />
				</HasPermission>
			}
		>
			<Table
				data={filtered}
				isFiltered={!!search}
				isFetching={query.isFetching}
				onRenew={(id: number) => showRenewCertificateModal(id, target.id, target.name)}
				onDownload={handleDownload}
				customAddBtn={<AddCertificateDropdown target={target} size={undefined} />}
				onDelete={(id: number) =>
					showDeleteConfirmModal({
						title: <T id="object.delete" tData={{ object: "certificate" }} />,
						onConfirm: () => handleDelete(id),
						invalidations: [["certificates"], ["certificate", id]],
						children: (
							<>
								<T id="object.delete.content" tData={{ object: "certificate" }} />
								<div className="mt-2 text-muted small">Agent: {target.name}</div>
							</>
						),
					})
				}
			/>
		</AgentSection>
	);
}

export default function TableWrapper() {
	const [search, setSearch] = useState("");
	const { targets, isLoading, isError, error } = useAgentTargets();

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;
	}

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-pink" />
			<div className="card-header">
				<div className="row w-full">
					<div className="col">
						<h2 className="mt-1 mb-0">
							<T id="certificates" />
						</h2>
						<div className="text-muted small">Showing current node and enabled agents on one page.</div>
					</div>
					<div className="col-md-auto col-sm-12">
						<div className="ms-auto d-flex flex-wrap btn-list">
							<div className="input-group input-group-flat w-auto">
								<span className="input-group-text input-group-text-sm">
									<IconSearch size={16} />
								</span>
								<input
									id="advanced-table-search"
									type="text"
									className="form-control form-control-sm"
									autoComplete="off"
									value={search}
									onChange={(e: any) => setSearch(e.target.value.toLowerCase().trim())}
								/>
							</div>
							<Button size="sm" onClick={() => showHelpModal("Certificates", "pink")}>
								<IconHelp size={20} />
							</Button>
							<HasPermission section={CERTIFICATES} permission={MANAGE} hideError>
								<div className="dropdown">
									<button type="button" className="btn btn-sm dropdown-toggle btn-pink" data-bs-toggle="dropdown">
										<T id="object.add" tData={{ object: "certificate" }} /> on…
									</button>
									<div className="dropdown-menu dropdown-menu-end">
										{targets.map((target) => (
											<div className="dropend" key={target.id}>
												<a className="dropdown-item dropdown-toggle" href="#" data-bs-toggle="dropdown">
													{target.name}
												</a>
												<div className="dropdown-menu">
													<a className="dropdown-item" href="#" onClick={(e) => { e.preventDefault(); showHTTPCertificateModal(target.id, target.name); }}>
														<T id="lets-encrypt-via-http" />
													</a>
													<a className="dropdown-item" href="#" onClick={(e) => { e.preventDefault(); showDNSCertificateModal(target.id, target.name); }}>
														<T id="lets-encrypt-via-dns" />
													</a>
													<div className="dropdown-divider" />
													<a className="dropdown-item" href="#" onClick={(e) => { e.preventDefault(); showCustomCertificateModal(target.id, target.name); }}>
														<T id="certificates.custom" />
													</a>
												</div>
											</div>
										))}
									</div>
								</div>
							</HasPermission>
						</div>
					</div>
				</div>
			</div>
			<div className="card-body p-3">
				{targets.map((target) => (
					<CertificateAgentSection key={target.id} target={target} search={search} />
				))}
			</div>
		</div>
	);
}
