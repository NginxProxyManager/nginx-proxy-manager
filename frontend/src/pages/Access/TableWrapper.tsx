import { IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { deleteAccessList } from "src/api/backend";
import { Button, LoadingPage } from "src/components";
import { useAccessLists } from "src/hooks";
import { intl, T } from "src/locale";
import { AccessListModal, DeleteConfirmModal } from "src/modals";
import { showSuccess } from "src/notifications";
import Table from "./Table";

export default function TableWrapper() {
	const [search, setSearch] = useState("");
	const [editId, setEditId] = useState(0 as number | "new");
	const [deleteId, setDeleteId] = useState(0);
	const { isFetching, isLoading, isError, error, data } = useAccessLists(["owner", "items", "clients"]);

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;
	}

	const handleDelete = async () => {
		await deleteAccessList(deleteId);
		showSuccess(intl.formatMessage({ id: "notification.access-deleted" }));
	};

	let filtered = null;
	if (search && data) {
		filtered = data?.filter((_item) => {
			return true;
			// TODO
			// return (
			// 	`${item.incomingPort}`.includes(search) ||
			// 	`${item.forwardingPort}`.includes(search) ||
			// 	item.forwardingHost.includes(search)
			// );
		});
	} else if (search !== "") {
		// this can happen if someone deletes the last item while searching
		setSearch("");
	}

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-cyan" />
			<div className="card-table">
				<div className="card-header">
					<div className="row w-full">
						<div className="col">
							<h2 className="mt-1 mb-0">
								<T id="access.title" />
							</h2>
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
									<Button size="sm" className="btn-cyan" onClick={() => setEditId("new")}>
										<T id="access.add" />
									</Button>
								</div>
							</div>
						) : null}
					</div>
				</div>
				<Table
					data={filtered ?? data ?? []}
					isFetching={isFetching}
					isFiltered={!!filtered}
					onEdit={(id: number) => setEditId(id)}
					onDelete={(id: number) => setDeleteId(id)}
					onNew={() => setEditId("new")}
				/>
				{editId ? <AccessListModal id={editId} onClose={() => setEditId(0)} /> : null}
				{deleteId ? (
					<DeleteConfirmModal
						title="access.delete.title"
						onConfirm={handleDelete}
						onClose={() => setDeleteId(0)}
						invalidations={[["access-lists"], ["access-list", deleteId]]}
					>
						<T id="access.delete.content" />
					</DeleteConfirmModal>
				) : null}
			</div>
		</div>
	);
}
