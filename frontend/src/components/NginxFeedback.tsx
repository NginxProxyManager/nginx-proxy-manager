import type { ReactNode } from "react";
import { Alert } from "react-bootstrap";
import type { HostMeta, NginxConfigErrorDetails } from "src/api/backend";
import { T } from "src/locale";
import { describeNginxError, getProblemLocations } from "src/modules/HostStatus";
import { Button } from "./Button";
import { LocationStatusDetail } from "./StatusBadges";

interface NginxErrorMessageProps {
	message: ReactNode;
	details?: NginxConfigErrorDetails | null;
}
/**
 * Body of the error Alert in the host modals for a rejected nginx config: what
 * went wrong in the UI language with nginx's error below it (or the backend's
 * message, for details the UI can't word), the hint, and the raw nginx output
 * behind a toggle.
 */
export function NginxErrorMessage({ message, details }: NginxErrorMessageProps) {
	const described = describeNginxError(details);
	const hint = described ? described.hint : details?.hint;
	return (
		<div data-testid="nginx-error">
			<div className="fw-bold">{described ? described.text : message}</div>
			{described?.detail ? <div className="text-break">{described.detail}</div> : null}
			{hint ? <div className="mt-1">{hint}</div> : null}
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

interface HostNginxErrorProps {
	meta?: HostMeta | null;
	// classes of the line with nginx's error
	detailClassName?: string;
	// classes of the line with the hint how to fix it
	hintClassName?: string;
	// the line that nginx still runs the host's previous config, when it does
	showPreviousConfig?: boolean;
}
/**
 * Why nginx did not load a host (meta.nginxErr), in the UI language with
 * nginx's error as an untranslated second line and the hint how to fix it
 */
export function HostNginxError({
	meta,
	detailClassName = "d-block text-break",
	hintClassName = "d-block text-secondary small mt-1",
	showPreviousConfig = true,
}: HostNginxErrorProps) {
	const described = describeNginxError(meta?.nginxDetails);
	const previous =
		showPreviousConfig && meta?.nginxDetails?.previousConfigRunning ? (
			<span className="d-block" data-testid="host-previous-config">
				<T id="nginx-error.previous-config-running" />
			</span>
		) : null;
	if (!described) {
		return meta?.nginxErr ? (
			<>
				<span className="d-block text-break">{meta.nginxErr}</span>
				{previous}
			</>
		) : null;
	}
	return (
		<>
			<span className="d-block text-break">{described.text}</span>
			{described.detail ? <span className={detailClassName}>{described.detail}</span> : null}
			{described.hint ? (
				<span className={hintClassName} data-testid="host-nginx-hint">
					{described.hint}
				</span>
			) : null}
			{previous}
		</>
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
					<T
						id={
							meta.nginxDetails?.previousConfigRunning
								? "save-warning.previous-config-running"
								: "save-warning.offline"
						}
					/>
					<HostNginxError meta={meta} showPreviousConfig={false} />
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
							<LocationStatusDetail location={p} />
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
