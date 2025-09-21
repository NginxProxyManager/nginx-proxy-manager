import { IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { Button, LoadingPage } from "src/components";
import { useDeadHosts } from "src/hooks";
import { intl } from "src/locale";
import { DeadHostModal, DeleteConfirmModal } from "src/modals";
import { showSuccess } from "src/notifications";
import Table from "./Table";

export default function TableWrapper() {
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
		// await deleteUser(deleteId);
		showSuccess(intl.formatMessage({ id: "notification.host-deleted" }));
	};

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-red" />
			<div className="card-table">
				<div className="card-header">
					<div className="row w-full">
						<div className="col">
							<h2 className="mt-1 mb-0">{intl.formatMessage({ id: "dead-hosts.title" })}</h2>
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
									/>
								</div>
								<Button size="sm" className="btn-red" onClick={() => setEditId("new")}>
									{intl.formatMessage({ id: "dead-hosts.add" })}
								</Button>
							</div>
						</div>
					</div>
				</div>
				<Table
					data={data ?? []}
					isFetching={isFetching}
					onDelete={(id: number) => setDeleteId(id)}
					onNew={() => setEditId("new")}
				/>
				{editId ? <DeadHostModal id={editId} onClose={() => setEditId(0)} /> : null}
				{deleteId ? (
					<DeleteConfirmModal
						title={intl.formatMessage({ id: "user.delete.title" })}
						onConfirm={handleDelete}
						onClose={() => setDeleteId(0)}
						invalidations={[["dead-hosts"], ["dead-host", deleteId]]}
					>
						{intl.formatMessage({ id: "user.delete.content" })}
					</DeleteConfirmModal>
				) : null}
			</div>
		</div>
	);
}
