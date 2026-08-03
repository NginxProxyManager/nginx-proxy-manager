import { IconHelp, IconRefresh, IconSearch } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { deleteProxyHost, toggleProxyHost } from "src/api/backend";
import { Button, HasPermission, LoadingPage } from "src/components";
import { useProxyHosts } from "src/hooks";
import { intl, T } from "src/locale";
import { showDeleteConfirmModal, showHelpModal, showProxyHostModal, showNginxLogViewerModal, showProxyHostMonitoringModal } from "src/modals";
import { MANAGE, PROXY_HOSTS } from "src/modules/Permissions";
import { showObjectSuccess } from "src/notifications";
import Table from "./Table";

export default function TableWrapper() {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const { isFetching, isLoading, isError, error, data, refetch } = useProxyHosts(["owner", "access_list", "certificate", "monitoring"]);

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;
	}

	const handleDelete = async (id: number) => {
		await deleteProxyHost(id);
		showObjectSuccess("proxy-host", "deleted");
	};

	const handleDisableToggle = async (id: number, enabled: boolean) => {
		await toggleProxyHost(id, enabled);
		queryClient.invalidateQueries({ queryKey: ["proxy-hosts"] });
		queryClient.invalidateQueries({ queryKey: ["proxy-host", id] });
		showObjectSuccess("proxy-host", enabled ? "enabled" : "disabled");
	};

	let filtered = null;
	if (search && data) {
		filtered = data?.filter(
			(item) =>
				item.domainNames.some((domain: string) => domain.toLowerCase().includes(search)) ||
				item.forwardHost.toLowerCase().includes(search) ||
				`${item.forwardPort}`.includes(search),
		);
	} else if (search !== "") {
		// this can happen if someone deletes the last item while searching
		setSearch("");
	}

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-lime" />
			<div className="card-table">
				<div className="card-header">
					<div className="row w-full">
						<div className="col">
							<h2 className="mt-1 mb-0">
								<T id="proxy-hosts" />
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
								<button
									type="button"
									className="btn btn-action btn-sm"
									onClick={() => refetch()}
									disabled={isFetching}
									title={intl.formatMessage({ id: "proxy-hosts.refresh", defaultMessage: "Refresh list" })}
									aria-label={intl.formatMessage({ id: "proxy-hosts.refresh", defaultMessage: "Refresh list" })}
								>
									<IconRefresh size={20} />
								</button>
								<Button size="sm" onClick={() => showHelpModal("ProxyHosts", "lime")}>
									<IconHelp size={20} />
								</Button>
								<HasPermission section={PROXY_HOSTS} permission={MANAGE} hideError>
									{data?.length ? (
										<Button
											size="sm"
											className="btn-lime"
											onClick={() => showProxyHostModal("new")}
										>
											<T id="object.add" tData={{ object: "proxy-host" }} />
										</Button>
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
					onEdit={(id: number) => showProxyHostModal(id)}
					onMonitoring={(id: number) => {
						const host = data?.find((item) => item.id === id);
						const label = host?.domainNames?.join(", ") || `${host?.forwardHost || "Proxy Host"}#${id}`;
						showProxyHostMonitoringModal(id, label);
					}}
					onLogs={(id: number) => {
						const host = data?.find((item) => item.id === id);
						const label =
							host?.nginxConfig?.listener?.mode === "port"
								? `:${host.nginxConfig.listener.port ?? id}`
								: host?.domainNames?.join(", ") || `#${id}`;
						showNginxLogViewerModal("proxy-hosts", id, label);
					}}
					onDelete={(id: number) => {
						const host = data?.find((h) => h.id === id);
						showDeleteConfirmModal({
							title: <T id="object.delete" tData={{ object: "proxy-host" }} />,
							onConfirm: () => handleDelete(id),
							invalidations: [["proxy-hosts"], ["proxy-host", id]],
							children: (
								<>
									<T id="object.delete.content" tData={{ object: "proxy-host" }} />
									{host?.nginxConfig?.listener?.mode === "port" ? (
										<div className="mt-2 fw-bold text-break">
											<T id="proxy-host.wizard.listener.port-number" />:{" "}
											{host.nginxConfig.listener.port}
										</div>
									) : host?.domainNames?.length ? (
										<div className="mt-2 fw-bold text-break">{host.domainNames.join(", ")}</div>
									) : null}
									{host?.forwardHost ? (
										<div className="mt-1 text-muted small">
											({host.forwardScheme}://{host.forwardHost}:{host.forwardPort})
										</div>
									) : null}
								</>
							),
						});
					}}
					onDisableToggle={handleDisableToggle}
					onNew={() => showProxyHostModal("new")}
				/>
			</div>
		</div>
	);
}
