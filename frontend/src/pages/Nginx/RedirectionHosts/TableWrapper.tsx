import { IconSearch } from "@tabler/icons-react";
import Alert from "react-bootstrap/Alert";
import { Button, LoadingPage } from "src/components";
import { useRedirectionHosts } from "src/hooks";
import { intl } from "src/locale";
import Table from "./Table";

export default function TableWrapper() {
	const { isFetching, isLoading, isError, error, data } = useRedirectionHosts(["owner", "certificate"]);

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;
	}

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-yellow" />
			<div className="card-table">
				<div className="card-header">
					<div className="row w-full">
						<div className="col">
							<h2 className="mt-1 mb-0">{intl.formatMessage({ id: "redirection-hosts.title" })}</h2>
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
								<Button size="sm" className="btn-yellow">
									{intl.formatMessage({ id: "redirection-hosts.add" })}
								</Button>
							</div>
						</div>
					</div>
				</div>
				<Table data={data ?? []} isFetching={isFetching} />
			</div>
		</div>
	);
}
