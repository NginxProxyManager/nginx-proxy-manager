import type { ReactNode } from "react";
import { Alert } from "react-bootstrap";
import type { HostMeta, NginxConfigErrorDetails } from "src/api/backend";
import { T } from "src/locale";
import { getProblemLocations } from "src/modules/HostStatus";
import { Button } from "./Button";

interface NginxErrorMessageProps {
	message: ReactNode;
	details?: NginxConfigErrorDetails | null;
}
/**
 * Body of the error Alert in the host modals for a rejected nginx config: the
 * humanised message, the hint, and the raw nginx output behind a toggle.
 */
export function NginxErrorMessage({ message, details }: NginxErrorMessageProps) {
	return (
		<div data-testid="nginx-error">
			<div className="fw-bold">{message}</div>
			{details?.hint ? <div className="mt-1">{details.hint}</div> : null}
			{details?.nginxOutput ? (
				<details className="mt-2">
					<summary>
						<T id="nginx-error.show-output" />
					</summary>
					<pre
						className="mt-2 mb-0 p-2 small text-break"
						style={{ maxHeight: "12rem", whiteSpace: "pre-wrap" }}
					>
						{details.nginxOutput}
					</pre>
				</details>
			) : null}
		</div>
	);
}

interface SaveWarningProps {
	meta?: HostMeta | null;
	onClose: () => void;
}
/**
 * Shown instead of closing the modal when a save succeeded but nginx didn't
 * take all of it: the host is offline, or some custom locations were disabled
 * or can't be resolved.
 */
export function SaveWarning({ meta, onClose }: SaveWarningProps) {
	const problems = getProblemLocations(meta);
	const quarantined = problems.filter((p) => p.status === "quarantined");
	const unresolved = problems.filter((p) => p.status === "unresolved");
	return (
		<Alert variant="warning" className="m-3" data-testid="save-warning">
			<h4 className="alert-title">
				<T id="save-warning.title" />
			</h4>
			{meta?.nginxOnline === false ? (
				<p className="mb-2">
					<T id="save-warning.offline" />
					{meta.nginxErr ? <span className="d-block text-break">{meta.nginxErr}</span> : null}
				</p>
			) : null}
			{quarantined.length ? (
				<p className="mb-1">
					<T id="save-warning.quarantined" data={{ count: quarantined.length }} />
				</p>
			) : null}
			{unresolved.length ? (
				<p className="mb-1">
					<T id="save-warning.unresolved" data={{ count: unresolved.length }} />
				</p>
			) : null}
			{problems.length ? (
				<ul className="mb-2">
					{problems.map((p) => (
						<li key={p.index}>
							<code>{p.path}</code>
							{": "}
							{p.message || <T id={`location-status.${p.status}.default`} />}
						</li>
					))}
				</ul>
			) : null}
			<div className="d-flex">
				<Button size="sm" className="ms-auto" onClick={onClose}>
					<T id="action.close" />
				</Button>
			</div>
		</Alert>
	);
}
