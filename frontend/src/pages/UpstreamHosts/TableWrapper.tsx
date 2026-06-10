import { IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { deleteUpstreamHost } from "src/api/backend";
import { Button, HasPermission, LoadingPage } from "src/components";
import { useUpstreamHosts } from "src/hooks";
import { T } from "src/locale";
import { showDeleteConfirmModal, showUpstreamHostModal } from "src/modals";
import { MANAGE, UPSTREAM_HOSTS } from "src/modules/Permissions";
import { showObjectSuccess } from "src/notifications";
import Table from "./Table";

export default function TableWrapper() {
	const [search, setSearch] = useState("");
	const { isFetching, isLoading, isError, error, data } = useUpstreamHosts(["owner", "servers"]);

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;
	}

	const handleDelete = async (id: number) => {
		await deleteUpstreamHost(id);
		showObjectSuccess("upstream-host", "deleted");
	};

	let filtered = null;
	if (search && data) {
		filtered = data?.filter((item) => {
			return item.name.toLowerCase().includes(search);
		});
	} else if (search !== "") {
		setSearch("");
	}

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-teal" />
			<div className="card-table">
				<div className="card-header">
					<div className="row w-full">
						<div className="col">
							<h2 className="mt-1 mb-0">
								<T id="upstream-hosts" />
							</h2>
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
								<HasPermission section={UPSTREAM_HOSTS} permission={MANAGE} hideError>
									{data?.length ? (
										<Button
											size="sm"
											className="btn-teal"
											onClick={() => showUpstreamHostModal("new")}
										>
											<T id="object.add" tData={{ object: "upstream-host" }} />
										</Button>
									) : null}
								</HasPermission>
							</div>
						</div>
					</div>
				</div>
				<Table
					data={filtered ?? data ?? []}
					isFetching={isFetching}
					isFiltered={!!filtered}
					onEdit={(id: number) => showUpstreamHostModal(id)}
					onDelete={(id: number) =>
						showDeleteConfirmModal({
							title: <T id="object.delete" tData={{ object: "upstream-host" }} />,
							onConfirm: () => handleDelete(id),
							invalidations: [["upstream-hosts"], ["upstream-host", id]],
							children: <T id="object.delete.content" tData={{ object: "upstream-host" }} />,
						})
					}
					onNew={() => showUpstreamHostModal("new")}
				/>
			</div>
		</div>
	);
}
