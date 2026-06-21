import { IconArrowsCross, IconBolt, IconBoltOff, IconDisc } from "@tabler/icons-react";
import { useQueries } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { HasPermission, LoadingPage } from "src/components";
import { getHostsReport } from "src/api/backend";
import { type AgentTarget, useAgentTargets } from "src/hooks";
import { T } from "src/locale";
import { DEAD_HOSTS, PROXY_HOSTS, REDIRECTION_HOSTS, STREAMS, VIEW } from "src/modules/Permissions";

type HostReport = Record<string, number>;

const emptyReport: HostReport = {
	proxy: 0,
	redirection: 0,
	stream: 0,
	dead: 0,
};

const reportKeys = ["proxy", "redirection", "stream", "dead"];

function addReports(reports: HostReport[]) {
	return reports.reduce(
		(total, report) => {
			for (const key of reportKeys) {
				total[key] = (total[key] ?? 0) + (report?.[key] ?? 0);
			}
			return total;
		},
		{ ...emptyReport },
	);
}

function useDashboardHostTotals(targets: AgentTarget[]) {
	const queries = useQueries({
		queries: targets.map((target) => ({
			queryKey: ["host-report", { agentId: target.id }],
			queryFn: () => getHostsReport(target.id),
			refetchOnWindowFocus: false,
			retry: 5,
			refetchInterval: 15 * 1000,
			staleTime: 14 * 1000,
		})),
	});
	const loadedReports = queries.map((query) => query.data).filter(Boolean) as HostReport[];
	const failedCount = queries.filter((query) => query.isError).length;
	return {
		data: addReports(loadedReports),
		isLoading: queries.some((query) => query.isLoading),
		isFetching: queries.some((query) => query.isFetching),
		failedCount,
		loadedCount: loadedReports.length,
		totalTargets: targets.length,
	};
}

function TotalHint({ loadedCount, totalTargets, failedCount }: { loadedCount: number; totalTargets: number; failedCount: number }) {
	return (
		<div className="text-muted small mt-1">
			Total across {loadedCount}/{totalTargets} nodes{failedCount ? ` · ${failedCount} failed` : ""}
		</div>
	);
}

const Dashboard = () => {
	const { targets, isLoading: agentsLoading } = useAgentTargets();
	const hostReport = useDashboardHostTotals(targets);
	const navigate = useNavigate();

	if (agentsLoading) {
		return <LoadingPage />;
	}

	return (
		<div>
			<h2>
				<T id="dashboard" />
			</h2>
			<div className="row row-deck row-cards">
				<div className="col-12 my-4">
					<div className="row row-cards">
						<HasPermission section={PROXY_HOSTS} permission={VIEW} hideError>
							<div className="col-sm-6 col-lg-3">
								<a
									href="/nginx/proxy"
									className="card card-sm card-link card-link-pop"
									onClick={(e) => {
										e.preventDefault();
										navigate("/nginx/proxy");
									}}
								>
									<div className="card-body">
										<div className="row align-items-center">
											<div className="col-auto">
												<span className="bg-green text-white avatar">
													<IconBolt />
												</span>
											</div>
											<div className="col">
												<div className="font-weight-medium">
													<T id="proxy-hosts.count" data={{ count: hostReport.data.proxy }} />
												</div>
												<TotalHint {...hostReport} />
											</div>
										</div>
									</div>
								</a>
							</div>
						</HasPermission>
						<HasPermission section={REDIRECTION_HOSTS} permission={VIEW} hideError>
							<div className="col-sm-6 col-lg-3">
								<a
									href="/nginx/redirection"
									className="card card-sm card-link card-link-pop"
									onClick={(e) => {
										e.preventDefault();
										navigate("/nginx/redirection");
									}}
								>
									<div className="card-body">
										<div className="row align-items-center">
											<div className="col-auto">
												<span className="bg-yellow text-white avatar">
													<IconArrowsCross />
												</span>
											</div>
											<div className="col">
												<T id="redirection-hosts.count" data={{ count: hostReport.data.redirection }} />
												<TotalHint {...hostReport} />
											</div>
										</div>
									</div>
								</a>
							</div>
						</HasPermission>
						<HasPermission section={STREAMS} permission={VIEW} hideError>
							<div className="col-sm-6 col-lg-3">
								<a
									href="/nginx/stream"
									className="card card-sm card-link card-link-pop"
									onClick={(e) => {
										e.preventDefault();
										navigate("/nginx/stream");
									}}
								>
									<div className="card-body">
										<div className="row align-items-center">
											<div className="col-auto">
												<span className="bg-blue text-white avatar">
													<IconDisc />
												</span>
											</div>
											<div className="col">
												<T id="streams.count" data={{ count: hostReport.data.stream }} />
												<TotalHint {...hostReport} />
											</div>
										</div>
									</div>
								</a>
							</div>
						</HasPermission>
						<HasPermission section={DEAD_HOSTS} permission={VIEW} hideError>
							<div className="col-sm-6 col-lg-3">
								<a
									href="/nginx/404"
									className="card card-sm card-link card-link-pop"
									onClick={(e) => {
										e.preventDefault();
										navigate("/nginx/404");
									}}
								>
									<div className="card-body">
										<div className="row align-items-center">
											<div className="col-auto">
												<span className="bg-red text-white avatar">
													<IconBoltOff />
												</span>
											</div>
											<div className="col">
												<T id="dead-hosts.count" data={{ count: hostReport.data.dead }} />
												<TotalHint {...hostReport} />
											</div>
										</div>
									</div>
								</a>
							</div>
						</HasPermission>
					</div>
				</div>
			</div>
		</div>
	);
};

export default Dashboard;
