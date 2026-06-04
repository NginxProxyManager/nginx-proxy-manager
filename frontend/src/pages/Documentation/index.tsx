import { IconExternalLink } from "@tabler/icons-react";
import { useSearchParams } from "react-router-dom";
import { docUrl, normalizeDocPath } from "src/config/docs";
import { T } from "src/locale";
import styles from "./Documentation.module.css";

export default function Documentation() {
	const [searchParams] = useSearchParams();
	const iframeSrc = docUrl(normalizeDocPath(searchParams.get("path")));

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-azure" />
			<div className="card-table">
				<div className="card-header">
					<div className="row w-full align-items-center">
						<div className="col">
							<h2 className="mt-1 mb-0">
								<T id="documentation" />
							</h2>
						</div>
						<div className="col-auto">
							<a
								className="btn btn-outline-secondary btn-sm"
								href={iframeSrc}
								target="_blank"
								rel="noopener noreferrer"
							>
								<IconExternalLink size={16} className="me-1" />
								<T id="documentation.open-new-tab" />
							</a>
						</div>
					</div>
				</div>
				<div className="p-0">
					<iframe
						title="Nginx Proxy Manager documentation"
						src={iframeSrc}
						className={`${styles.documentationIframe} w-100 border-0`}
					/>
				</div>
			</div>
		</div>
	);
}
