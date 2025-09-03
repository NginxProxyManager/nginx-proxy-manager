import { IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { deleteUser } from "src/api/backend";
import { Button, LoadingPage } from "src/components";
import { useUser, useUsers } from "src/hooks";
import { intl } from "src/locale";
import { DeleteConfirmModal, UserModal } from "src/modals";
import { showSuccess } from "src/notifications";
import Table from "./Table";

export default function TableWrapper() {
	const [editUserId, setEditUserId] = useState(0 as number | "new");
	const [deleteUserId, setDeleteUserId] = useState(0);
	const { isFetching, isLoading, isError, error, data } = useUsers(["permissions"]);
	const { data: currentUser } = useUser("me");

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;
	}

	const handleDelete = async () => {
		await deleteUser(deleteUserId);
		showSuccess(intl.formatMessage({ id: "notification.user-deleted" }));
	};

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-orange" />
			<div className="card-table">
				<div className="card-header">
					<div className="row w-full">
						<div className="col">
							<h2 className="mt-1 mb-0">{intl.formatMessage({ id: "users.title" })}</h2>
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
								<Button size="sm" className="btn-orange" onClick={() => setEditUserId("new")}>
									{intl.formatMessage({ id: "users.add" })}
								</Button>
							</div>
						</div>
					</div>
				</div>
				<Table
					data={data ?? []}
					isFetching={isFetching}
					currentUserId={currentUser?.id}
					onEditUser={(id: number) => setEditUserId(id)}
					onDeleteUser={(id: number) => setDeleteUserId(id)}
					onNewUser={() => setEditUserId("new")}
				/>
				{editUserId ? <UserModal userId={editUserId} onClose={() => setEditUserId(0)} /> : null}
				{deleteUserId ? (
					<DeleteConfirmModal
						title={intl.formatMessage({ id: "user.delete.title" })}
						onConfirm={handleDelete}
						onClose={() => setDeleteUserId(0)}
						invalidations={[["users"], ["user", deleteUserId]]}
					>
						{intl.formatMessage({ id: "user.delete.content" })}
					</DeleteConfirmModal>
				) : null}
			</div>
		</div>
	);
}
