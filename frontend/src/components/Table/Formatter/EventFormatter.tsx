import { IconBoltOff, IconUser } from "@tabler/icons-react";
import type { AuditLog } from "src/api/backend";
import { DateTimeFormat, intl } from "src/locale";

const getEventTitle = (event: AuditLog) => (
	<span>{intl.formatMessage({ id: `event.${event.action}-${event.objectType}` })}</span>
);

const getEventValue = (event: AuditLog) => {
	switch (event.objectType) {
		case "user":
			return event.meta?.name;
		case "dead-host":
			return event.meta?.domainNames?.join(", ") || "N/A";
		default:
			return `UNKNOWN EVENT TYPE: ${event.objectType}`;
	}
};

const getColorForAction = (action: string) => {
	switch (action) {
		case "created":
			return "text-lime";
		case "deleted":
			return "text-red";
		default:
			return "text-blue";
	}
};

const getIcon = (row: AuditLog) => {
	const c = getColorForAction(row.action);
	let ico = null;
	switch (row.objectType) {
		case "user":
			ico = <IconUser size={16} className={c} />;
			break;
		case "dead-host":
			ico = <IconBoltOff size={16} className={c} />;
			break;
	}

	return ico;
};

interface Props {
	row: AuditLog;
}
export function EventFormatter({ row }: Props) {
	return (
		<div className="flex-fill">
			<div className="font-weight-medium">
				{getIcon(row)} {getEventTitle(row)} &mdash; <span className="badge">{getEventValue(row)}</span>
			</div>
			<div className="text-secondary mt-1">{DateTimeFormat(row.createdOn)}</div>
		</div>
	);
}
