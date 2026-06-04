import { IconExternalLink } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DOC_SECTIONS, docUrl, normalizeDocPath } from "src/config/docs";
import { T } from "src/locale";
import styles from "./Documentation.module.css";

const sectionIndexForPath = (path: string): number => {
	const normalized = normalizeDocPath(path, "");
	if (!normalized) {
		return 0;
	}
	const idx = DOC_SECTIONS.findIndex(
		(s) => s.path === normalized || s.path === `${normalized}/` || normalized.startsWith(`${s.path}/`),
	);
	return idx >= 0 ? idx : 0;
};

const sectionIndexFromQuery = (searchParams: URLSearchParams): number => {
	const raw = searchParams.get("path");
	if (!raw) {
		return 0;
	}
	return sectionIndexForPath(raw);
};

export default function Documentation() {
	const [searchParams] = useSearchParams();
	const [sectionIndex, setSectionIndex] = useState(0);

	useEffect(() => {
		setSectionIndex(sectionIndexFromQuery(searchParams));
	}, [searchParams]);

	const section = DOC_SECTIONS[sectionIndex] ?? DOC_SECTIONS[0];
	const iframeSrc = docUrl(section.path);

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
				<div className="row g-0">
					<div className="col-12 col-md-3 border-end">
						<div className="card-body mt-0 pt-0">
							<div className="list-group list-group-transparent">
								{DOC_SECTIONS.map((item, index) => (
									<button
										key={item.id}
										type="button"
										className={`list-group-item list-group-item-action ${sectionIndex === index ? "active" : ""}`}
										onClick={() => setSectionIndex(index)}
									>
										<T id={item.labelId} />
									</button>
								))}
							</div>
						</div>
					</div>
					<div className="col-12 col-md-9 d-flex flex-column p-0">
						<iframe
							title="Nginx Proxy Manager documentation"
							src={iframeSrc}
							className={`${styles.documentationIframe} w-100 border-0`}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
