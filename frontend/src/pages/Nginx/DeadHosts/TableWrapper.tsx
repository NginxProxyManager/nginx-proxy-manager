import { IconSearch } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { deleteDeadHost, toggleDeadHost } from "src/api/backend";
import { Button, LoadingPage } from "src/components";
import { useDeadHosts } from "src/hooks";
import { intl } from "src/locale";
import { DeadHostModal, DeleteConfirmModal } from "src/modals";
import { showSuccess } from "src/notifications";
import Table from "./Table";

export default function TableWrapper() {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [deleteId, setDeleteId] = useState(0);
	const [editId, setEditId] = useState(0 as number | "new");
	const { isFetching, isLoading, isError, error, data } = useDeadHosts(["owner", "certificate"]);

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;
	}

	const handleDelete = async () => {
		await deleteDeadHost(deleteId);
		showSuccess(intl.formatMessage({ id: "notification.host-deleted" }));
	};

	const handleDisableToggle = async (id: number, enabled: boolean) => {
		await toggleDeadHost(id, enabled);
		queryClient.invalidateQueries({ queryKey: ["dead-hosts"] });
		queryClient.invalidateQueries({ queryKey: ["dead-host", id] });
		showSuccess(intl.formatMessage({ id: enabled ? "notification.host-enabled" : "notification.host-disabled" }));
	};

	let filtered = null;
	if (search && data) {
		filtered = data?.filter((item) => {
			return item.domainNames.some((domain: string) => domain.toLowerCase().includes(search));
		});
	} else if (search !== "") {
		// this can happen if someone deletes the last item while searching
		setSearch("");
	}

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-red" />
			<div className="card-table">
				<div className="card-header">
					<div className="row w-full">
						<div className="col">
							<h2 className="mt-1 mb-0">{intl.formatMessage({ id: "dead-hosts.title" })}</h2>
						</div>
						{data?.length ? (
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
											onChange={(e: any) => setSearch(e.target.value.toLowerCase().trim())}
										/>
									</div>

									<Button size="sm" className="btn-red" onClick={() => setEditId("new")}>
										{intl.formatMessage({ id: "dead-hosts.add" })}
									</Button>
								</div>
							</div>
						) : null}
					</div>
				</div>
				<Table
					data={filtered ?? data ?? []}
					isFiltered={!!search}
					isFetching={isFetching}
					onEdit={(id: number) => setEditId(id)}
					onDelete={(id: number) => setDeleteId(id)}
					onDisableToggle={handleDisableToggle}
					onNew={() => setEditId("new")}
				/>
				{editId ? <DeadHostModal id={editId} onClose={() => setEditId(0)} /> : null}
				{deleteId ? (
					<DeleteConfirmModal
						title={intl.formatMessage({ id: "dead-host.delete.title" })}
						onConfirm={handleDelete}
						onClose={() => setDeleteId(0)}
						invalidations={[["dead-hosts"], ["dead-host", deleteId]]}
					>
						{intl.formatMessage({ id: "dead-host.delete.content" })}
					</DeleteConfirmModal>
				) : null}
			</div>
		</div>
	);
}
