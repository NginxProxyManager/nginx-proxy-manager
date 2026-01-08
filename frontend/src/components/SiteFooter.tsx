import { useCheckVersion, useHealth } from "src/hooks";
import { T } from "src/locale";

export function SiteFooter() {
	const health = useHealth();
	const { data: versionData } = useCheckVersion();

	const version = health.data?.version || "";
	const githubTag = version.split("-").slice(0, 4).join("-");
	const githubLinkType = githubTag.length < 13 ? "tree" : "releases/tag";

	return (
		<footer className="footer d-print-none py-3">
			<div className="container-xl">
				<div className="row text-center align-items-center flex-row-reverse">
					<div className="col-lg-auto ms-lg-auto">
						<ul className="list-inline list-inline-dots mb-0">
							<li className="list-inline-item">
								<a
									href="https://github.com/ZoeyVid/NPMplus"
									target="_blank"
									className="link-secondary"
									rel="noopener"
								>
									<T id="footer.github" />
								</a>
							</li>
						</ul>
					</div>
					<div className="col-12 col-lg-auto mt-3 mt-lg-0">
						<ul className="list-inline list-inline-dots mb-0">
							<li className="list-inline-item">© {new Date().getFullYear()} AGPLv3 AND MIT</li>
							<li className="list-inline-item">
								<a href="https://jc21.com" rel="noreferrer" target="_blank" className="link-secondary">
									jc21.com
								</a>
							</li>
							<li className="list-inline-item">
								<a
									href="https://github.com/ZoeyVid"
									rel="noreferrer"
									target="_blank"
									className="link-secondary"
								>
									ZoeyVid
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
									href={`https://github.com/ZoeyVid/NPMplus/${githubLinkType}/${githubTag}`}
									className="link-secondary"
									target="_blank"
									rel="noopener"
								>
									{" "}
									{version}{" "}
								</a>
							</li>
							{versionData?.updateAvailable && versionData?.latest && (
								<li className="list-inline-item">
									<a
										href={`https://github.com/ZoeyVid/NPMplus/releases/tag/${versionData.latest}`}
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
