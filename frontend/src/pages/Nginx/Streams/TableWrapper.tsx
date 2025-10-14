import { IconSearch } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { deleteStream, toggleStream } from "src/api/backend";
import { Button, LoadingPage } from "src/components";
import { useStreams } from "src/hooks";
import { intl, T } from "src/locale";
import { showDeleteConfirmModal, showStreamModal } from "src/modals";
import { showSuccess } from "src/notifications";
import Table from "./Table";

export default function TableWrapper() {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [_deleteId, _setDeleteIdd] = useState(0);
	const { isFetching, isLoading, isError, error, data } = useStreams(["owner", "certificate"]);

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;
	}

	const handleDelete = async (id: number) => {
		await deleteStream(id);
		showSuccess(intl.formatMessage({ id: "notification.stream-deleted" }));
	};

	const handleDisableToggle = async (id: number, enabled: boolean) => {
		await toggleStream(id, enabled);
		queryClient.invalidateQueries({ queryKey: ["streams"] });
		queryClient.invalidateQueries({ queryKey: ["stream", id] });
		showSuccess(
			intl.formatMessage({ id: enabled ? "notification.stream-enabled" : "notification.stream-disabled" }),
		);
	};

	let filtered = null;
	if (search && data) {
		filtered = data?.filter((item) => {
			return (
				`${item.incomingPort}`.includes(search) ||
				`${item.forwardingPort}`.includes(search) ||
				item.forwardingHost.includes(search)
			);
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
							<h2 className="mt-1 mb-0">
								<T id="streams.title" />
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
									<Button size="sm" className="btn-blue" onClick={() => showStreamModal("new")}>
										<T id="streams.add" />
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
					onEdit={(id: number) => showStreamModal(id)}
					onDelete={(id: number) =>
						showDeleteConfirmModal({
							title: "stream.delete.title",
							onConfirm: () => handleDelete(id),
							invalidations: [["streams"], ["stream", id]],
							children: <T id="stream.delete.content" />,
						})
					}
					onDisableToggle={handleDisableToggle}
					onNew={() => showStreamModal("new")}
				/>
			</div>
		</div>
	);
}
