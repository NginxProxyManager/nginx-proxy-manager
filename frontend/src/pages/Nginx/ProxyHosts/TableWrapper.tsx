import { IconSearch } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { deleteProxyHost, toggleProxyHost } from "src/api/backend";
import { Button, LoadingPage } from "src/components";
import { useProxyHosts } from "src/hooks";
import { intl } from "src/locale";
import { DeleteConfirmModal, ProxyHostModal } from "src/modals";
import { showSuccess } from "src/notifications";
import Table from "./Table";

export default function TableWrapper() {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [deleteId, setDeleteId] = useState(0);
	const [editId, setEditId] = useState(0 as number | "new");
	const { isFetching, isLoading, isError, error, data } = useProxyHosts(["owner", "access_list", "certificate"]);

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;
	}

	const handleDelete = async () => {
		await deleteProxyHost(deleteId);
		showSuccess(intl.formatMessage({ id: "notification.host-deleted" }));
	};

	const handleDisableToggle = async (id: number, enabled: boolean) => {
		await toggleProxyHost(id, enabled);
		queryClient.invalidateQueries({ queryKey: ["proxy-hosts"] });
		queryClient.invalidateQueries({ queryKey: ["proxy-host", id] });
		showSuccess(intl.formatMessage({ id: enabled ? "notification.host-enabled" : "notification.host-disabled" }));
	};

	let filtered = null;
	if (search && data) {
		filtered = data?.filter((_item) => {
			return true;
			// item.domainNames.some((domain: string) => domain.toLowerCase().includes(search)) ||
			// item.forwardDomainName.toLowerCase().includes(search)
			// );
		});
	} else if (search !== "") {
		// this can happen if someone deletes the last item while searching
		setSearch("");
	}

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-lime" />
			<div className="card-table">
				<div className="card-header">
					<div className="row w-full">
						<div className="col">
							<h2 className="mt-1 mb-0">{intl.formatMessage({ id: "proxy-hosts.title" })}</h2>
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
										/>
									</div>
									<Button size="sm" className="btn-lime">
										{intl.formatMessage({ id: "proxy-hosts.add" })}
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
				{editId ? <ProxyHostModal id={editId} onClose={() => setEditId(0)} /> : null}
				{deleteId ? (
					<DeleteConfirmModal
						title={intl.formatMessage({ id: "proxy-host.delete.title" })}
						onConfirm={handleDelete}
						onClose={() => setDeleteId(0)}
						invalidations={[["proxy-hosts"], ["proxy-host", deleteId]]}
					>
						{intl.formatMessage({ id: "proxy-host.delete.content" })}
					</DeleteConfirmModal>
				) : null}
			</div>
		</div>
	);
}
