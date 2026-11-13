import type { ReactNode } from "react";
import { Alert } from "react-bootstrap";
import type { HostMeta, NginxConfigErrorDetails } from "src/api/backend";
import { T } from "src/locale";
import { describeNginxError } from "src/modules/HostStatus";
import { Button } from "./Button";

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
}
/**
 * Why nginx did not load a host (meta.nginxErr), in the UI language with
 * nginx's error as an untranslated second line and the hint how to fix it
 */
export function HostNginxError({
	meta,
	detailClassName = "d-block text-break",
	hintClassName = "d-block text-secondary small mt-1",
}: HostNginxErrorProps) {
	const described = describeNginxError(meta?.nginxDetails);
	if (!described) {
		return meta?.nginxErr ? <span className="d-block text-break">{meta.nginxErr}</span> : null;
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
		</>
	);
}

interface SaveWarningProps {
	meta?: HostMeta | null;
	onClose: () => void;
}
/**
 * Shown instead of closing the modal when a save succeeded but nginx didn't
 * take all of it: the host is offline.
 */
export function SaveWarning({ meta, onClose }: SaveWarningProps) {
	return (
		<Alert variant="warning" className="m-3" data-testid="save-warning">
			<h4 className="alert-title">
				<T id="save-warning.title" />
			</h4>
			{meta?.nginxOnline === false ? (
				<p className="mb-2">
					<T id="save-warning.offline" />
					<HostNginxError meta={meta} />
				</p>
			) : null}
			<div className="d-flex">
				<Button size="sm" className="ms-auto" onClick={onClose}>
					<T id="action.close" />
				</Button>
			</div>
		</Alert>
	);
}
