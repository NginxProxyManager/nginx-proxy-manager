import { IconArrowsCross, IconBolt, IconBoltOff, IconDisc } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { useHostReport } from "src/hooks";
import { intl } from "src/locale";

const Dashboard = () => {
	const { data: hostReport } = useHostReport();
	const navigate = useNavigate();

	return (
		<div>
			<h2>{intl.formatMessage({ id: "dashboard.title" })}</h2>
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
												{intl.formatMessage(
													{ id: "proxy-hosts.count" },
													{ count: hostReport?.proxy },
												)}
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
											{intl.formatMessage(
												{ id: "redirection-hosts.count" },
												{ count: hostReport?.redirection },
											)}
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
											{intl.formatMessage({ id: "streams.count" }, { count: hostReport?.stream })}
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
											{intl.formatMessage(
												{ id: "dead-hosts.count" },
												{ count: hostReport?.dead },
											)}
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

- Users: permissions modal and trigger after adding user
- modal dialgs for everything
- Tables
- check mobile
- fix bad jwt not refreshing entire page
- add help docs for host types

More for api, then implement here:
- Properly implement refresh tokens
- Add error message_18n for all backend errors
- minor: certificates expand with hosts needs to omit 'is_deleted'
`}</code>
			</pre>
		</div>
	);
};

export default Dashboard;
