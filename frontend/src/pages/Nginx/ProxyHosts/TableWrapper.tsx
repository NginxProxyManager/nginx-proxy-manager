import { IconHelp, IconSearch } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { deleteProxyHost, toggleProxyHost, type ProxyHost } from "src/api/backend";
import { AgentSection, Button, HasPermission, LoadingPage } from "src/components";
import { type AgentTarget, useAgentTargets, useProxyHosts } from "src/hooks";
import { T } from "src/locale";
import { showDeleteConfirmModal, showHelpModal, showProxyHostModal } from "src/modals";
import { MANAGE, PROXY_HOSTS } from "src/modules/Permissions";
import { showObjectSuccess } from "src/notifications";
import Table from "./Table";

const filterProxyHosts = (data: ProxyHost[], search: string) => {
	if (!search) return data;
	return data.filter(
		(item) =>
			item.domainNames.some((domain: string) => domain.toLowerCase().includes(search)) ||
			item.forwardHost.toLowerCase().includes(search) ||
			`${item.forwardPort}`.includes(search),
	);
};

interface SectionProps {
	target: AgentTarget;
	search: string;
}

function ProxyHostAgentSection({ target, search }: SectionProps) {
	const queryClient = useQueryClient();
	const query = useProxyHosts(["owner", "access_list", "certificate"], {}, target.id);
	const data = query.data ?? [];
	const filtered = filterProxyHosts(data, search);
	const agentName = target.name;

	const handleDelete = async (id: number) => {
		await deleteProxyHost(id, target.id);
		showObjectSuccess("proxy-host", "deleted");
	};

	const handleDisableToggle = async (id: number, enabled: boolean) => {
		await toggleProxyHost(id, enabled, target.id);
		queryClient.invalidateQueries({ queryKey: ["proxy-hosts"] });
		queryClient.invalidateQueries({ queryKey: ["proxy-host", id] });
		showObjectSuccess("proxy-host", enabled ? "enabled" : "disabled");
	};

	return (
		<AgentSection
			target={target}
			color="lime"
			isLoading={query.isLoading}
			isFetching={query.isFetching}
			isError={query.isError}
			error={query.error}
			shownCount={filtered.length}
			totalCount={data.length}
			onRetry={() => query.refetch()}
			actions={
				<HasPermission section={PROXY_HOSTS} permission={MANAGE} hideError>
					<Button size="sm" className="btn-lime" onClick={() => showProxyHostModal("new", target.id)}>
						<T id="object.add" tData={{ object: "proxy-host" }} />
					</Button>
				</HasPermission>
			}
		>
			<Table
				data={filtered}
				isFiltered={!!search}
				isFetching={query.isFetching}
				onEdit={(id: number) => showProxyHostModal(id, target.id)}
				onDelete={(id: number) => {
					const host = data.find((h) => h.id === id);
					showDeleteConfirmModal({
						title: <T id="object.delete" tData={{ object: "proxy-host" }} />,
						onConfirm: () => handleDelete(id),
						invalidations: [["proxy-hosts"], ["proxy-host", id]],
						children: (
							<>
								<T id="object.delete.content" tData={{ object: "proxy-host" }} />
								<div className="mt-2 text-muted small">Agent: {agentName}</div>
								{host?.domainNames?.length ? (
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
				onNew={() => showProxyHostModal("new", target.id)}
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
			<div className="card-status-top bg-lime" />
			<div className="card-header">
				<div className="row w-full">
					<div className="col">
						<h2 className="mt-1 mb-0">
							<T id="proxy-hosts" />
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
							<Button size="sm" onClick={() => showHelpModal("ProxyHosts", "lime")}>
								<IconHelp size={20} />
							</Button>
							<HasPermission section={PROXY_HOSTS} permission={MANAGE} hideError>
								<div className="dropdown">
									<button type="button" className="btn btn-sm dropdown-toggle btn-lime" data-bs-toggle="dropdown">
										<T id="object.add" tData={{ object: "proxy-host" }} /> on…
									</button>
									<div className="dropdown-menu dropdown-menu-end">
										{targets.map((target) => (
											<a
												key={target.id}
												className="dropdown-item"
												href="#"
												onClick={(e) => {
													e.preventDefault();
													showProxyHostModal("new", target.id);
												}}
											>
												{target.name}
											</a>
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
					<ProxyHostAgentSection key={target.id} target={target} search={search} />
				))}
			</div>
		</div>
	);
}
