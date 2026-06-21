import { IconSearch } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { deleteUser, toggleUser, type User } from "src/api/backend";
import { AgentSection, Button, LoadingPage } from "src/components";
import { useAuthState } from "src/context";
import { type AgentTarget, useAgentTargets, useUser, useUsers } from "src/hooks";
import { T } from "src/locale";
import { showDeleteConfirmModal, showPermissionsModal, showSetPasswordModal, showUserModal } from "src/modals";
import { showError, showObjectSuccess } from "src/notifications";
import Table from "./Table";

const filterUsers = (data: User[], search: string) => {
	if (!search) return data;
	return data.filter((item) => {
		return (
			item.name.toLowerCase().includes(search) ||
			item.nickname.toLowerCase().includes(search) ||
			item.email.toLowerCase().includes(search)
		);
	});
};

function UserAgentSection({ target, search }: { target: AgentTarget; search: string }) {
	const queryClient = useQueryClient();
	const { loginAs } = useAuthState();
	const query = useUsers(["permissions"], {}, target.id);
	const { data: currentUser } = useUser("me", {}, target.id);
	const data = query.data ?? [];
	const filtered = filterUsers(data, search);

	const handleDelete = async (id: number) => {
		await deleteUser(id, target.id);
		showObjectSuccess("user", "deleted");
	};

	const handleDisableToggle = async (id: number, enabled: boolean) => {
		await toggleUser(id, enabled, target.id);
		queryClient.invalidateQueries({ queryKey: ["users"] });
		queryClient.invalidateQueries({ queryKey: ["user", id] });
		showObjectSuccess("user", enabled ? "enabled" : "disabled");
	};

	const handleLoginAs = async (id: number) => {
		try {
			if (target.isLocal) {
				await loginAs(id);
				return;
			}
			showError("Login as is only available on the current node in the multi-agent manager.");
		} catch (err) {
			if (err instanceof Error) {
				showError(err.message);
			}
		}
	};

	return (
		<AgentSection
			target={target}
			color="orange"
			isLoading={query.isLoading}
			isFetching={query.isFetching}
			isError={query.isError}
			error={query.error}
			shownCount={filtered.length}
			totalCount={data.length}
			onRetry={() => query.refetch()}
			actions={
				<Button size="sm" className="btn-orange" onClick={() => showUserModal("new", target.id, target.name)}>
					<T id="object.add" tData={{ object: "user" }} />
				</Button>
			}
		>
			<Table
				data={filtered}
				isFiltered={!!search}
				isFetching={query.isFetching}
				currentUserId={currentUser?.id}
				onEditUser={(id: number) => showUserModal(id, target.id, target.name)}
				onEditPermissions={(id: number) => showPermissionsModal(id, target.id, target.name)}
				onSetPassword={(id: number) => showSetPasswordModal(id, target.id, target.name)}
				onDeleteUser={(id: number) =>
					showDeleteConfirmModal({
						title: <T id="object.delete" tData={{ object: "user" }} />,
						onConfirm: () => handleDelete(id),
						invalidations: [["users"], ["user", id]],
						children: (
							<>
								<T id="object.delete.content" tData={{ object: "user" }} />
								<div className="mt-2 text-muted small">Agent: {target.name}</div>
							</>
						),
					})
				}
				onDisableToggle={handleDisableToggle}
				onNewUser={() => showUserModal("new", target.id, target.name)}
				onLoginAs={handleLoginAs}
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
			<div className="card-status-top bg-orange" />
			<div className="card-header">
				<div className="row w-full">
					<div className="col">
						<h2 className="mt-1 mb-0">
							<T id="users" />
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
							<div className="dropdown">
								<button type="button" className="btn btn-sm dropdown-toggle btn-orange" data-bs-toggle="dropdown">
									<T id="object.add" tData={{ object: "user" }} /> on…
								</button>
								<div className="dropdown-menu dropdown-menu-end">
									{targets.map((target) => (
										<a
											key={target.id}
											className="dropdown-item"
											href="#"
											onClick={(e) => {
												e.preventDefault();
												showUserModal("new", target.id, target.name);
											}}
										>
											{target.name}
										</a>
									))}
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
			<div className="card-body p-3">
				{targets.map((target) => (
					<UserAgentSection key={target.id} target={target} search={search} />
				))}
			</div>
		</div>
	);
}
