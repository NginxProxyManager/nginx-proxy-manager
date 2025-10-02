import { IconSearch } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { deleteUser, toggleUser } from "src/api/backend";
import { Button, LoadingPage } from "src/components";
import { useUser, useUsers } from "src/hooks";
import { intl, T } from "src/locale";
import { DeleteConfirmModal, PermissionsModal, SetPasswordModal, UserModal } from "src/modals";
import { showSuccess } from "src/notifications";
import Table from "./Table";

export default function TableWrapper() {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [editUserId, setEditUserId] = useState(0 as number | "new");
	const [editUserPermissionsId, setEditUserPermissionsId] = useState(0);
	const [editUserPasswordId, setEditUserPasswordId] = useState(0);
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

	const handleDisableToggle = async (id: number, enabled: boolean) => {
		await toggleUser(id, enabled);
		queryClient.invalidateQueries({ queryKey: ["users"] });
		queryClient.invalidateQueries({ queryKey: ["user", id] });
		showSuccess(intl.formatMessage({ id: enabled ? "notification.user-enabled" : "notification.user-disabled" }));
	};

	let filtered = null;
	if (search && data) {
		filtered = data?.filter((item) => {
			return (
				item.name.toLowerCase().includes(search) ||
				item.nickname.toLowerCase().includes(search) ||
				item.email.toLowerCase().includes(search)
			);
		});
	} else if (search !== "") {
		// this can happen if someone deletes the last item while searching
		setSearch("");
	}

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-orange" />
			<div className="card-table">
				<div className="card-header">
					<div className="row w-full">
						<div className="col">
							<h2 className="mt-1 mb-0">
								<T id="users.title" />
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

									<Button size="sm" className="btn-orange" onClick={() => setEditUserId("new")}>
										<T id="users.add" />
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
					currentUserId={currentUser?.id}
					onEditUser={(id: number) => setEditUserId(id)}
					onEditPermissions={(id: number) => setEditUserPermissionsId(id)}
					onSetPassword={(id: number) => setEditUserPasswordId(id)}
					onDeleteUser={(id: number) => setDeleteUserId(id)}
					onDisableToggle={handleDisableToggle}
					onNewUser={() => setEditUserId("new")}
				/>
				{editUserId ? <UserModal userId={editUserId} onClose={() => setEditUserId(0)} /> : null}
				{editUserPermissionsId ? (
					<PermissionsModal userId={editUserPermissionsId} onClose={() => setEditUserPermissionsId(0)} />
				) : null}
				{deleteUserId ? (
					<DeleteConfirmModal
						title="user.delete.title"
						onConfirm={handleDelete}
						onClose={() => setDeleteUserId(0)}
						invalidations={[["users"], ["user", deleteUserId]]}
					>
						<T id="user.delete.content" />
					</DeleteConfirmModal>
				) : null}
				{editUserPasswordId ? (
					<SetPasswordModal userId={editUserPasswordId} onClose={() => setEditUserPasswordId(0)} />
				) : null}
			</div>
		</div>
	);
}
