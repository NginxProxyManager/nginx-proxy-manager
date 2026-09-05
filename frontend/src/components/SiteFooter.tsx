import { useCheckVersion, useHealth } from "src/hooks";
import { T } from "src/locale";

export function SiteFooter() {
	const health = useHealth();
	const { data: versionData } = useCheckVersion();

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
									href="https://github.com/Lorwell/nginx-proxy-manager"
									target="_blank"
									className="link-secondary"
									rel="noopener"
								>
									<T id="footer.github-fork" />
								</a>
							</li>
						</ul>
					</div>
					<div className="col-12 col-lg-auto mt-3 mt-lg-0">
						<ul className="list-inline list-inline-dots mb-0">
							<li className="list-inline-item">
								© 2026{" "}
								<a href="https://github.com/Lorwell" rel="noreferrer" target="_blank" className="link-secondary">
									Lorwell contributors
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
									href={`https://hub.docker.com/r/moailaozi/nginx-proxy-manager/tags?name=${getVersion().replace(/^v/, "")}`}
									className="link-secondary"
									target="_blank"
									rel="noopener"
								>
									{" "}
									{getVersion()}{" "}
								</a>
							</li>
							{versionData?.updateAvailable && versionData?.latest && (
								<li className="list-inline-item">
									<a
										href={`https://hub.docker.com/r/moailaozi/nginx-proxy-manager/tags?name=${versionData.latest.replace(/^v/, "")}`}
										className="link-warning fw-bold"
										target="_blank"
										rel="noopener"
										title={`New version ${versionData.latest} is available`}
									>
										<T id="update-available" data={{ latestVersion: versionData.latest }} />
									</a>
								</li>
							)}
						</ul>
					</div>
				</div>
			</div>
		</footer>
	);
}
