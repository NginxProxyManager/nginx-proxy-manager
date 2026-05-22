import { IconHelp, IconSearch } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import Alert from "react-bootstrap/Alert";
import { deleteProxyHost, toggleProxyHost } from "src/api/backend";
import { Button, HasPermission, LoadingPage } from "src/components";
import { useProxyHosts } from "src/hooks";
import { intl, T } from "src/locale";
import { showDeleteConfirmModal, showHelpModal, showProxyHostModal } from "src/modals";
import { MANAGE, PROXY_HOSTS } from "src/modules/Permissions";
import { showObjectSuccess } from "src/notifications";
import Table from "./Table";

export default function TableWrapper() {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	// `null` means "all groups"; any other value is an exact group label
	// (including "" for ungrouped hosts).
	const [groupFilter, setGroupFilter] = useState<string | null>(null);
	const { isFetching, isLoading, isError, error, data } = useProxyHosts(["owner", "access_list", "certificate"]);

	const uniqueGroups = useMemo(() => {
		if (!data) return [];
		const labels = new Set<string>();
		for (const item of data) {
			labels.add(item.hostGroupLabel || "");
		}
		return Array.from(labels).sort((a, b) => {
			if (!a && b) return 1;
			if (a && !b) return -1;
			return a.localeCompare(b);
		});
	}, [data]);

	const hasGroups = uniqueGroups.length > 1 || (uniqueGroups.length === 1 && uniqueGroups[0] !== "");

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

	let filtered = data ?? [];

	if (groupFilter !== null) {
		filtered = filtered.filter((item) => (item.hostGroupLabel || "") === groupFilter);
	}

	if (search) {
		filtered = filtered.filter(
			(item) =>
				item.domainNames.some((domain: string) => domain.toLowerCase().includes(search)) ||
				item.forwardHost.toLowerCase().includes(search) ||
				`${item.forwardPort}`.includes(search) ||
				(item.hostGroupLabel || "").toLowerCase().includes(search),
		);
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
								{hasGroups && data?.length ? (
									<select
										className="form-select form-select-sm"
										style={{ width: "auto", minWidth: "140px" }}
										// Option values are indices, not labels, so a group named
										// "all" (or anything else) can never collide with the
										// "all groups" choice.
										value={groupFilter === null ? -1 : uniqueGroups.indexOf(groupFilter)}
										onChange={(e) => {
											const idx = Number(e.target.value);
											setGroupFilter(idx === -1 ? null : uniqueGroups[idx]);
										}}
									>
										<option value={-1}>{intl.formatMessage({ id: "all-groups" })}</option>
										{uniqueGroups.map((label, idx) => (
											<option key={label} value={idx}>
												{label || intl.formatMessage({ id: "ungrouped" })}
											</option>
										))}
									</select>
								) : null}
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
					data={filtered}
					isFiltered={!!search || groupFilter !== null}
					isFetching={isFetching}
					onEdit={(id: number) => showProxyHostModal(id)}
					onDelete={(id: number) => {
						const host = data?.find((h) => h.id === id);
						showDeleteConfirmModal({
							title: <T id="object.delete" tData={{ object: "proxy-host" }} />,
							onConfirm: () => handleDelete(id),
							invalidations: [["proxy-hosts"], ["proxy-host", id]],
							children: (
								<>
									<T id="object.delete.content" tData={{ object: "proxy-host" }} />
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
					onNew={() => showProxyHostModal("new")}
				/>
			</div>
		</div>
	);
}
