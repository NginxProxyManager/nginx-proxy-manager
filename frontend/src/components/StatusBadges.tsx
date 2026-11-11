import cn from "classnames";
import type { ReactNode } from "react";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import type { LocationStatusValue, NginxLocationStatus } from "src/api/backend";
import { T } from "src/locale";
import { locationStatusText } from "src/modules/HostStatus";

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

interface LocationStatusDetailProps {
	location: Pick<NginxLocationStatus, "status" | "code" | "params" | "message">;
}
/** What a custom location's state means, nginx's error (not translated) below it */
export function LocationStatusDetail({ location }: LocationStatusDetailProps) {
	const { text, detail } = locationStatusText(location);
	return (
		<>
			{text}
			{detail ? <span className="d-block small text-break">{detail}</span> : null}
		</>
	);
}

interface LocationStatusBadgeProps {
	id: string;
	status: LocationStatusValue;
	location?: Pick<NginxLocationStatus, "status" | "code" | "params" | "message"> | null;
}
/** Server reported status of a custom location; nothing for "ok" */
export function LocationStatusBadge({ id, status, location }: LocationStatusBadgeProps) {
	if (status === "ok") {
		return null;
	}
	const tip =
		status === "disabled" ? null : <LocationStatusDetail location={location || { status, message: null }} />;
	return (
		<Tip id={`${id}-tip`} tip={tip}>
			<span className={cn("badge", LOCATION_STATUS_CLASS[status])} data-status={status}>
				<T id={`location-status.${status}`} />
			</span>
		</Tip>
	);
}
