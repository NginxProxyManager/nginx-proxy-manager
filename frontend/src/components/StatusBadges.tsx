import { IconAlertTriangle, IconCheck, IconLoader2, IconX } from "@tabler/icons-react";
import cn from "classnames";
import type { ReactNode } from "react";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import type { LocationStatusValue, UpstreamCheckResult } from "src/api/backend";
import { intl, T } from "src/locale";
import { isTranslatedCheckCode } from "src/modules/HostStatus";

interface TipProps {
	id: string;
	tip?: ReactNode;
	children: ReactNode;
}
// A badge with an optional tooltip; focusable so the tip works without a mouse
function Tip({ id, tip, children }: TipProps) {
	if (!tip) {
		return <>{children}</>;
	}
	return (
		<OverlayTrigger placement="top" trigger={["hover", "focus"]} overlay={<Tooltip id={id}>{tip}</Tooltip>}>
			{/* biome-ignore lint/a11y/noNoninteractiveTabindex: focus shows the tooltip for keyboard and touch users */}
			<span tabIndex={0} className="d-inline-flex">
				{children}
			</span>
		</OverlayTrigger>
	);
}

const LOCATION_STATUS_CLASS: Record<LocationStatusValue, string> = {
	ok: "bg-green-lt",
	disabled: "bg-secondary-lt",
	unresolved: "bg-yellow-lt",
	quarantined: "bg-red-lt",
};

interface LocationStatusBadgeProps {
	id: string;
	status: LocationStatusValue;
	message?: string | null;
}
/** Server reported status of a custom location; nothing for "ok" */
export function LocationStatusBadge({ id, status, message }: LocationStatusBadgeProps) {
	if (status === "ok") {
		return null;
	}
	const tip =
		status === "disabled" ? null : message || intl.formatMessage({ id: `location-status.${status}.default` });
	return (
		<Tip id={`${id}-tip`} tip={tip}>
			<span className={cn("badge", LOCATION_STATUS_CLASS[status])} data-status={status}>
				<T id={`location-status.${status}`} />
			</span>
		</Tip>
	);
}

/** Whole milliseconds, "<1" below one, as in the check's message */
export const formatCheckMs = (ms: number): string => (ms < 1 ? "<1" : `${Math.round(ms)}`);

/** Short translated text for a reachability check result */
export const checkResultText = (result: UpstreamCheckResult): string => {
	if (result.code === "ok") {
		return typeof result.ms === "number"
			? intl.formatMessage({ id: "upstream.check.ok-ms" }, { ms: formatCheckMs(result.ms) })
			: intl.formatMessage({ id: "upstream.check.ok" });
	}
	if (isTranslatedCheckCode(result.code)) {
		return intl.formatMessage({ id: `upstream.check.${result.code}` });
	}
	return result.message || result.code;
};

interface UpstreamCheckBadgeProps {
	id: string;
	result: UpstreamCheckResult | null;
	isChecking?: boolean;
}
/** Live reachability of a forward host:port */
export function UpstreamCheckBadge({ id, result, isChecking }: UpstreamCheckBadgeProps) {
	if (isChecking) {
		return (
			<span className="badge bg-secondary-lt" data-check="checking">
				<IconLoader2 size={12} className="me-1" />
				<T id="upstream.check.checking" />
			</span>
		);
	}
	if (!result || result.code === "disabled") {
		return null;
	}
	const warn = result.code === "resolver_mismatch";
	const cls = result.ok ? (warn ? "bg-yellow-lt" : "bg-green-lt") : "bg-red-lt";
	const icon = result.ok ? (
		warn ? (
			<IconAlertTriangle size={12} className="me-1" />
		) : (
			<IconCheck size={12} className="me-1" />
		)
	) : (
		<IconX size={12} className="me-1" />
	);
	const tip = [result.message, result.addresses?.length ? result.addresses.join(", ") : null]
		.filter(Boolean)
		.join(" – ");
	return (
		<Tip id={`${id}-tip`} tip={tip || null}>
			<span className={cn("badge", cls)} data-check={result.code}>
				{icon}
				{checkResultText(result)}
			</span>
		</Tip>
	);
}

/**
 * Live reachability of a forward host:port as a hint line below the field, for
 * columns too narrow to fit a badge next to the label.
 */
export function UpstreamCheckHint({ id, result, isChecking }: UpstreamCheckBadgeProps) {
	if (isChecking) {
		return (
			<div id={id} className="form-hint d-flex align-items-center mt-1 text-secondary" data-check="checking">
				<IconLoader2 size={14} className="me-1 flex-shrink-0" />
				<T id="upstream.check.checking" />
			</div>
		);
	}
	if (!result || result.code === "disabled") {
		return null;
	}
	const warn = result.code === "resolver_mismatch";
	const cls = result.ok ? (warn ? "text-warning" : "text-success") : "text-danger";
	const Icon = result.ok ? (warn ? IconAlertTriangle : IconCheck) : IconX;
	const details = [result.message, result.addresses?.length ? result.addresses.join(", ") : null]
		.filter(Boolean)
		.join(" – ");
	return (
		<div id={id} className="form-hint d-flex align-items-start mt-1" data-check={result.code}>
			<Icon size={14} className={cn("me-1 mt-1 flex-shrink-0", cls)} />
			<span className="text-break">
				<span className={cls}>{checkResultText(result)}</span>
				{details ? <span className="text-secondary"> – {details}</span> : null}
			</span>
		</div>
	);
}

/** In place of a reachability check for a forward host that is an nginx variable */
export function VariableHostBadge({ id }: { id: string }) {
	return (
		<Tip id={`${id}-tip`} tip={intl.formatMessage({ id: "upstream.check.variable-tip" })}>
			<span className="badge bg-secondary-lt" data-check="variable">
				<T id="upstream.check.variable" />
			</span>
		</Tip>
	);
}

/** `VariableHostBadge` as a hint line below the field */
export function VariableHostHint({ id, tipId = "upstream.check.variable-tip" }: { id: string; tipId?: string }) {
	return (
		<div id={id} className="form-hint mt-1 text-secondary" data-check="variable">
			<T id="upstream.check.variable" /> – <T id={tipId} />
		</div>
	);
}
