import { IconSearch } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { deleteUser, toggleUser } from "src/api/backend";
import { Button, LoadingPage } from "src/components";
import { useAuthState } from "src/context";
import { useUser, useUsers } from "src/hooks";
import { T } from "src/locale";
import { showDeleteConfirmModal, showPermissionsModal, showSetPasswordModal, showUserModal } from "src/modals";
import { showError, showObjectSuccess } from "src/notifications";
import Table from "./Table";

export default function TableWrapper() {
	const queryClient = useQueryClient();
	const { loginAs } = useAuthState();
	const [search, setSearch] = useState("");
	const { isFetching, isLoading, isError, error, data } = useUsers(["permissions"]);
	const { data: currentUser } = useUser("me");

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;
	}

	const handleLoginAs = async (id: number) => {
		try {
			await loginAs(id);
		} catch (err) {
			if (err instanceof Error) {
				showError(err.message);
			}
		}
	};

	const handleDelete = async (id: number) => {
		await deleteUser(id);
		showObjectSuccess("user", "deleted");
	};

	const handleDisableToggle = async (id: number, enabled: boolean) => {
		await toggleUser(id, enabled);
		queryClient.invalidateQueries({ queryKey: ["users"] });
		queryClient.invalidateQueries({ queryKey: ["user", id] });
		showObjectSuccess("user", enabled ? "enabled" : "disabled");
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
								<T id="users" />
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

									<Button size="sm" className="btn-orange" onClick={() => showUserModal("new")}>
										<T id="object.add" tData={{ object: "user" }} />
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
					onEditUser={(id: number) => showUserModal(id)}
					onEditPermissions={(id: number) => showPermissionsModal(id)}
					onSetPassword={(id: number) => showSetPasswordModal(id)}
					onDeleteUser={(id: number) =>
						showDeleteConfirmModal({
							title: <T id="object.delete" tData={{ object: "user" }} />,
							onConfirm: () => handleDelete(id),
							invalidations: [["users"], ["user", id]],
							children: <T id="object.delete.content" tData={{ object: "user" }} />,
						})
					}
					onDisableToggle={handleDisableToggle}
					onNewUser={() => showUserModal("new")}
					onLoginAs={handleLoginAs}
				/>
			</div>
		</div>
	);
}
