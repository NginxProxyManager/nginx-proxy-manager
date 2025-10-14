import { IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { deleteAccessList } from "src/api/backend";
import { Button, LoadingPage } from "src/components";
import { useAccessLists } from "src/hooks";
import { intl, T } from "src/locale";
import { showAccessListModal, showDeleteConfirmModal } from "src/modals";
import { showSuccess } from "src/notifications";
import Table from "./Table";

export default function TableWrapper() {
	const [search, setSearch] = useState("");
	const { isFetching, isLoading, isError, error, data } = useAccessLists(["owner", "items", "clients"]);

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;
	}

	const handleDelete = async (id: number) => {
		await deleteAccessList(id);
		showSuccess(intl.formatMessage({ id: "notification.access-deleted" }));
	};

	let filtered = null;
	if (search && data) {
		filtered = data?.filter((item) => {
			return item.name.toLowerCase().includes(search);
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
									<Button size="sm" className="btn-cyan" onClick={() => showAccessListModal("new")}>
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
					onEdit={(id: number) => showAccessListModal(id)}
					onDelete={(id: number) =>
						showDeleteConfirmModal({
							title: "access.delete.title",
							onConfirm: () => handleDelete(id),
							invalidations: [["access-lists"], ["access-list", id]],
							children: <T id="access.delete.content" />,
						})
					}
					onNew={() => showAccessListModal("new")}
				/>
			</div>
		</div>
	);
}
