import { IconHelp, IconSearch } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { deleteRedirectionHost, toggleRedirectionHost } from "src/api/backend";
import { Button, HasPermission, LoadingPage } from "src/components";
import { useRedirectionHosts } from "src/hooks";
import { T } from "src/locale";
import { showDeleteConfirmModal, showHelpModal, showRedirectionHostModal } from "src/modals";
import { MANAGE, REDIRECTION_HOSTS } from "src/modules/Permissions";
import { showObjectSuccess } from "src/notifications";
import Table from "./Table";

export default function TableWrapper() {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const { isFetching, isLoading, isError, error, data } = useRedirectionHosts(["owner", "certificate"]);

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;
	}

	const handleDelete = async (id: number) => {
		await deleteRedirectionHost(id);
		showObjectSuccess("redirection-host", "deleted");
	};

	const handleDisableToggle = async (id: number, enabled: boolean) => {
		await toggleRedirectionHost(id, enabled);
		queryClient.invalidateQueries({ queryKey: ["redirection-hosts"] });
		queryClient.invalidateQueries({ queryKey: ["redirection-host", id] });
		showObjectSuccess("redirection-host", enabled ? "enabled" : "disabled");
	};

	let filtered = null;
	if (search && data) {
		filtered = data?.filter((item) => {
			return (
				item.domainNames.some((domain: string) => domain.toLowerCase().includes(search)) ||
				item.forwardDomainName.toLowerCase().includes(search)
			);
		});
	} else if (search !== "") {
		// this can happen if someone deletes the last item while searching
		setSearch("");
	}

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-yellow" />
			<div className="card-table">
				<div className="card-header">
					<div className="row w-full">
						<div className="col">
							<h2 className="mt-1 mb-0">
								<T id="redirection-hosts" />
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
								<Button size="sm" onClick={() => showHelpModal("RedirectionHosts", "yellow")}>
									<IconHelp size={20} />
								</Button>
								<HasPermission section={REDIRECTION_HOSTS} permission={MANAGE} hideError>
									{data?.length ? (
										<Button
											size="sm"
											className="btn-yellow"
											onClick={() => showRedirectionHostModal("new")}
										>
											<T id="object.add" tData={{ object: "redirection-host" }} />
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
					onEdit={(id: number) => showRedirectionHostModal(id)}
					onDelete={(id: number) =>
						showDeleteConfirmModal({
							title: <T id="object.delete" tData={{ object: "redirection-host" }} />,
							onConfirm: () => handleDelete(id),
							invalidations: [["redirection-hosts"], ["redirection-host", id]],
							children: <T id="object.delete.content" tData={{ object: "redirection-host" }} />,
						})
					}
					onDisableToggle={handleDisableToggle}
					onNew={() => showRedirectionHostModal("new")}
				/>
			</div>
		</div>
	);
}
