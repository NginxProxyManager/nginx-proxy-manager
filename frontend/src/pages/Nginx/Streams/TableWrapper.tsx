import { IconSearch } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { Button, LoadingPage } from "src/components";
import { useStreams } from "src/hooks";
import { intl } from "src/locale";
import { DeleteConfirmModal, StreamModal } from "src/modals";
import { showSuccess } from "src/notifications";
import Table from "./Table";

export default function TableWrapper() {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [editId, setEditId] = useState(0 as number | "new");
	const [deleteId, setDeleteId] = useState(0);
	const { isFetching, isLoading, isError, error, data } = useStreams(["owner", "certificate"]);

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;
	}

	const handleDelete = async () => {
		// await deleteDeadHost(deleteId);
		showSuccess(intl.formatMessage({ id: "notification.host-deleted" }));
	};

	const handleDisableToggle = async (id: number, enabled: boolean) => {
		// await toggleDeadHost(id, enabled);
		queryClient.invalidateQueries({ queryKey: ["dead-hosts"] });
		queryClient.invalidateQueries({ queryKey: ["dead-host", id] });
		showSuccess(intl.formatMessage({ id: enabled ? "notification.host-enabled" : "notification.host-disabled" }));
	};

	let filtered = null;
	if (search && data) {
		filtered = data?.filter((_item) => {
			return true;
			// return item.domainNames.some((domain: string) => domain.toLowerCase().includes(search));
		});
	} else if (search !== "") {
		// this can happen if someone deletes the last item while searching
		setSearch("");
	}

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-blue" />
			<div className="card-table">
				<div className="card-header">
					<div className="row w-full">
						<div className="col">
							<h2 className="mt-1 mb-0">{intl.formatMessage({ id: "streams.title" })}</h2>
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
								<Button size="sm" className="btn-blue" onClick={() => setEditId("new")}>
									{intl.formatMessage({ id: "streams.add" })}
								</Button>
							</div>
						</div>
					</div>
				</div>
				<Table
					data={filtered ?? data ?? []}
					isFetching={isFetching}
					onEdit={(id: number) => setEditId(id)}
					onDelete={(id: number) => setDeleteId(id)}
					onDisableToggle={handleDisableToggle}
					onNew={() => setEditId("new")}
				/>
				{editId ? <StreamModal id={editId} onClose={() => setEditId(0)} /> : null}
				{deleteId ? (
					<DeleteConfirmModal
						title={intl.formatMessage({ id: "stream.delete.title" })}
						onConfirm={handleDelete}
						onClose={() => setDeleteId(0)}
						invalidations={[["streams"], ["stream", deleteId]]}
					>
						{intl.formatMessage({ id: "stream.delete.content" })}
					</DeleteConfirmModal>
				) : null}
			</div>
		</div>
	);
}
