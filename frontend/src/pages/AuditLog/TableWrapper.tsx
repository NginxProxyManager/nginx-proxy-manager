import { IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { LoadingPage } from "src/components";
import { useAuditLogs } from "src/hooks";
import { T } from "src/locale";
import { showEventDetailsModal } from "src/modals";
import Table from "./Table";

export default function TableWrapper() {
	const [search, setSearch] = useState("");
	const { isFetching, isLoading, isError, error, data } = useAuditLogs(["user"]);

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;
	}

	let filtered = null;
	if (search && data) {
		filtered = data.filter((item) => {
			const metaText = JSON.stringify(item.meta || {}).toLowerCase();
			const value = [item.objectType, item.action, metaText].filter(Boolean).join(" ").toLowerCase();

			return value.includes(search);
		});
	} else if (search !== "") {
		// this can happen if someone deletes the last item while searching
		setSearch("");
	}

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-purple" />
			<div className="card-table">
				<div className="card-header">
					<div className="row w-full">
						<div className="col">
							<h2 className="mt-1 mb-0">
								<T id="auditlogs" />
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
								</div>
							</div>
						) : null}
					</div>
				</div>
				<Table data={filtered ?? data ?? []} isFetching={isFetching} onSelectItem={showEventDetailsModal} />
			</div>
		</div>
	);
}
