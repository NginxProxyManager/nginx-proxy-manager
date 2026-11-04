import { IconCircleCheck, IconPlayerPlay } from "@tabler/icons-react";
import cn from "classnames";
import { useFormikContext } from "formik";
import { Alert } from "react-bootstrap";
import type { HostTestResult, HostTestUpstream } from "src/api/backend";
import { formValuesKey } from "src/hooks";
import { intl, T } from "src/locale";
import { formatApiError, getNginxErrorDetails } from "src/modules/HostStatus";
import { Button } from "./Button";
import { NginxErrorMessage } from "./NginxFeedback";
import { LocationStatusBadge, UpstreamCheckBadge } from "./StatusBadges";

export type HostTestState = "ok" | "warnings" | "rejected" | "quarantined" | "error";

export const getHostTestState = (result: HostTestResult | null, error: unknown): HostTestState | null => {
	if (error) return "error";
	if (!result) return null;
	if (!result.nginxOnline) return "rejected";
	if (!result.ok) return "quarantined";
	// nginx accepts it, but something will not work yet: an unresolved location,
	// an unreachable target or a warning about another host
	const unresolved = result.nginxLocations.some((l) => l.status === "unresolved");
	const unreachable = result.upstreams.some((u) => !u.ok && u.code !== "disabled");
	if (unresolved || unreachable || result.warnings.length) return "warnings";
	return "ok";
};

const VARIANT: Record<HostTestState, string> = {
	ok: "success",
	warnings: "warning",
	rejected: "danger",
	quarantined: "warning",
	error: "danger",
};

const upstreamLabel = (upstream: HostTestUpstream) =>
	upstream.locationIndex === null ? (
		<T id="host-test.main-target" />
	) : (
		<code>{upstream.path || `#${upstream.locationIndex + 1}`}</code>
	);

interface ResultProps {
	result: HostTestResult | null;
	error: unknown;
	testedKey: string | null;
	onClose: () => void;
}
/**
 * Result of "Test" in a host modal, shown above the tabs. Must be rendered
 * inside the modal's Formik form: it notices when the form changed since.
 */
export function HostConfigTestResult({ result, error, testedKey, onClose }: ResultProps) {
	const { values } = useFormikContext<any>();
	const state = getHostTestState(result, error);
	if (!state) {
		return null;
	}
	const stale = testedKey !== null && testedKey !== formValuesKey(values);

	if (state === "error") {
		const details = getNginxErrorDetails(error);
		return (
			<Alert
				variant="danger"
				className="m-3"
				onClose={onClose}
				dismissible
				data-testid="host-test-result"
				data-state={state}
			>
				<h4 className="alert-title">
					<T id="host-test.failed" />
				</h4>
				{details ? (
					<NginxErrorMessage message={formatApiError(error)} details={details} />
				) : (
					formatApiError(error)
				)}
			</Alert>
		);
	}

	const res = result as HostTestResult;
	const quarantined = res.nginxLocations.filter((l) => l.status === "quarantined");
	return (
		<Alert
			variant={VARIANT[state]}
			className="m-3"
			onClose={onClose}
			dismissible
			data-testid="host-test-result"
			data-state={state}
		>
			<h4 className="alert-title d-flex align-items-center">
				{state === "ok" ? <IconCircleCheck size={20} className="me-1" /> : null}
				{state === "ok" ? <T id="host-test.ok" /> : null}
				{state === "warnings" ? <T id="host-test.ok-warnings" /> : null}
				{state === "rejected" ? <T id="host-test.rejected" /> : null}
				{state === "quarantined" ? <T id="host-test.quarantined" data={{ count: quarantined.length }} /> : null}
			</h4>
			{state === "rejected" ? (
				<div className="mb-2">
					<NginxErrorMessage message={res.nginxErr || ""} details={res.nginxDetails} />
				</div>
			) : null}

			{res.nginxLocations.length ? (
				<div className="mb-2" data-testid="host-test-locations">
					<div className="fw-bold">
						<T id="column.custom-locations" />
					</div>
					<ul className="list-unstyled mb-0">
						{res.nginxLocations.map((l) => (
							<li key={l.index} className="d-flex flex-wrap align-items-center gap-1 mt-1">
								<code>{l.path}</code>
								{l.status === "ok" ? (
									<span className="badge bg-green-lt" data-status="ok">
										<T id="location-status.ok" />
									</span>
								) : (
									<LocationStatusBadge id={`host-test-location-${l.index}`} status={l.status} />
								)}
								{l.status !== "ok" && l.status !== "disabled" ? (
									<span className="text-break small">
										{l.message || intl.formatMessage({ id: `location-status.${l.status}.default` })}
									</span>
								) : null}
							</li>
						))}
					</ul>
				</div>
			) : null}

			{res.upstreams.length ? (
				<div className="mb-2" data-testid="host-test-upstreams">
					<div className="fw-bold">
						<T id="host-test.reachability" />
					</div>
					<ul className="list-unstyled mb-0">
						{res.upstreams.map((u, i) => (
							<li
								key={`${u.locationIndex ?? "main"}-${u.host}-${u.port}-${i}`}
								className="d-flex flex-wrap align-items-center gap-1 mt-1"
							>
								{upstreamLabel(u)}
								<span className="text-secondary text-break">
									{u.host}:{u.port}
								</span>
								{u.code === "rate_limited" ? (
									<span className="text-secondary small" data-check="rate_limited">
										<T id="host-test.rate-limited" />
									</span>
								) : (
									<UpstreamCheckBadge id={`host-test-upstream-${i}`} result={u} />
								)}
								{u.code === "disabled" ? (
									<span className="text-secondary small">
										<T id="upstream.check.disabled" />
									</span>
								) : null}
							</li>
						))}
					</ul>
				</div>
			) : null}

			{res.warnings.length ? (
				<ul className="mb-2 ps-3">
					{res.warnings.map((w) => (
						<li key={`${w.code}-${w.hostType ?? ""}-${w.hostId ?? ""}`} className="text-break">
							{w.message}
						</li>
					))}
				</ul>
			) : null}

			<div className={cn("small", stale ? "text-warning" : "text-secondary")}>
				<T id={stale ? "host-test.stale" : "host-test.not-saved"} />
			</div>
		</Alert>
	);
}

interface ButtonProps {
	onClick: () => void;
	isTesting: boolean;
	disabled?: boolean;
}
/** "Test" in a host modal's footer, left of Save */
export function TestConfigButton({ onClick, isTesting, disabled }: ButtonProps) {
	return (
		<Button className="ms-auto me-2" onClick={onClick} isLoading={isTesting} disabled={disabled || isTesting}>
			<IconPlayerPlay size={16} className="me-1" />
			<T id="test" />
		</Button>
	);
}
