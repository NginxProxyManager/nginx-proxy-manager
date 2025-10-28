import { IconArrowsCross, IconBolt, IconBoltOff, IconDisc } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { useHostReport } from "src/hooks";
import { T } from "src/locale";

const Dashboard = () => {
	const { data: hostReport } = useHostReport();
	const navigate = useNavigate();

	return (
		<div>
			<h2>
				<T id="dashboard" />
			</h2>
			<div className="row row-deck row-cards">
				<div className="col-12 my-4">
					<div className="row row-cards">
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
												<T id="proxy-hosts.count" data={{ count: hostReport?.proxy }} />
											</div>
										</div>
									</div>
								</div>
							</a>
						</div>
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
											<T id="redirection-hosts.count" data={{ count: hostReport?.redirection }} />
										</div>
									</div>
								</div>
							</a>
						</div>
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
											<T id="streams.count" data={{ count: hostReport?.stream }} />
										</div>
									</div>
								</div>
							</a>
						</div>
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
											<T id="dead-hosts.count" data={{ count: hostReport?.dead }} />
										</div>
									</div>
								</div>
							</a>
						</div>
					</div>
				</div>
			</div>
			<pre>
				<code>{`Todo:

- check mobile
- add help docs for host types
- REDO SCREENSHOTS in docs folder
- search codebase for "TODO"
- update documentation to add development notes for translations
- double check output of access field selection on proxy host dialog, after access lists are completed
- check permissions in all places

More for api, then implement here:
- Add error message_18n for all backend errors
- minor: certificates expand with hosts needs to omit 'is_deleted'
- properly wrap all logger.debug called in isDebug check
- add new api endpoint changes to swagger docs

`}</code>
			</pre>
		</div>
	);
};

export default Dashboard;
