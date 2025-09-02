import { useHealth } from "src/hooks";
import { intl } from "src/locale";

export function SiteFooter() {
	const health = useHealth();

	const getVersion = () => {
		if (!health.data) {
			return "";
		}
		const v = health.data.version;
		return `v${v.major}.${v.minor}.${v.revision}`;
	};

	return (
		<footer className="footer d-print-none py-3">
			<div className="container-xl">
				<div className="row text-center align-items-center flex-row-reverse">
					<div className="col-lg-auto ms-lg-auto">
						<ul className="list-inline list-inline-dots mb-0">
							<li className="list-inline-item">
								<a
									href="https://github.com/NginxProxyManager/nginx-proxy-manager"
									target="_blank"
									className="link-secondary"
									rel="noopener"
								>
									{intl.formatMessage({ id: "footer.github-fork" })}
								</a>
							</li>
						</ul>
					</div>
					<div className="col-12 col-lg-auto mt-3 mt-lg-0">
						<ul className="list-inline list-inline-dots mb-0">
							<li className="list-inline-item">
								© 2025{" "}
								<a href="https://jc21.com" rel="noreferrer" target="_blank" className="link-secondary">
									jc21.com
								</a>
							</li>
							<li className="list-inline-item">
								Theme by{" "}
								<a href="https://tabler.io" rel="noreferrer" target="_blank" className="link-secondary">
									Tabler
								</a>
							</li>
							<li className="list-inline-item">
								<a
									href={`https://github.com/NginxProxyManager/nginx-proxy-manager/releases/tag/${getVersion()}`}
									className="link-secondary"
									target="_blank"
									rel="noopener"
								>
									{" "}
									{getVersion()}{" "}
								</a>
							</li>
						</ul>
					</div>
				</div>
			</div>
		</footer>
	);
}
