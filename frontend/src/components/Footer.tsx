import React from "react";

import { useHealthState } from "context";
import { intl } from "locale";

function Footer() {
	const { health } = useHealthState();

	return (
		<footer className="footer footer-transparent d-print-none">
			<div className="container">
				<div className="row text-center align-items-center flex-row-reverse">
					<div className="col-lg-auto ms-lg-auto">
						<ul className="list-inline list-inline-dots mb-0">
							<li className="list-inline-item">
								<a
									href="https://nginxproxymanager.com?utm_source=npm"
									target="_blank"
									rel="noreferrer"
									className="link-secondary">
									{intl.formatMessage({
										id: "footer.userguide",
										defaultMessage: "User Guide",
									})}
								</a>
							</li>
							<li className="list-inline-item">
								<a
									href="https://github.com/jc21/nginx-proxy-manager/releases?utm_source=npm"
									target="_blank"
									rel="noreferrer"
									className="link-secondary">
									{intl.formatMessage({
										id: "footer.changelog",
										defaultMessage: "Change Log",
									})}
								</a>
							</li>
							<li className="list-inline-item">
								<a
									href="https://github.com/jc21/nginx-proxy-manager?utm_source=npm"
									target="_blank"
									rel="noreferrer"
									className="link-secondary">
									{intl.formatMessage({
										id: "footer.github",
										defaultMessage: "Github",
									})}
								</a>
							</li>
						</ul>
					</div>
					<div className="col-12 col-lg-auto mt-3 mt-lg-0">
						<ul className="list-inline list-inline-dots mb-0">
							<li className="list-inline-item">
								{intl.formatMessage(
									{
										id: "footer.copyright",
										defaultMessage: "Copyright © {year} jc21.com",
									},
									{ year: new Date().getFullYear() },
								)}{" "}
								<a
									className="link-secondary"
									href="https://preview.tabler.io/"
									target="_blank"
									rel="noreferrer">
									{intl.formatMessage({
										id: "footer.theme",
										defaultMessage: "Theme by Tabler",
									})}
								</a>
							</li>
							<li className="list-inline-item">
								<a
									href="https://github.com/jc21/nginx-proxy-manager/releases?utm_source=npm"
									target="_blank"
									className="link-secondary"
									rel="noopener noreferrer">
									v{health.version} {String.fromCharCode(183)} {health.commit}
								</a>
							</li>
						</ul>
					</div>
				</div>
			</div>
		</footer>
	);
}

export { Footer };
