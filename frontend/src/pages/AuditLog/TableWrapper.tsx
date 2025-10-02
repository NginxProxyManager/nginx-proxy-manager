import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { LoadingPage } from "src/components";
import { useAuditLogs } from "src/hooks";
import { T } from "src/locale";
import { EventDetailsModal } from "src/modals";
import Table from "./Table";

export default function TableWrapper() {
	const [eventId, setEventId] = useState(0);
	const { isFetching, isLoading, isError, error, data } = useAuditLogs(["user"]);

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;
	}

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-purple" />
			<div className="card-table">
				<div className="card-header">
					<div className="row w-full">
						<div className="col">
							<h2 className="mt-1 mb-0">
								<T id="auditlog.title" />
							</h2>
						</div>
					</div>
				</div>
				<Table data={data ?? []} isFetching={isFetching} onSelectItem={setEventId} />
				{eventId ? <EventDetailsModal id={eventId} onClose={() => setEventId(0)} /> : null}
			</div>
		</div>
	);
}
