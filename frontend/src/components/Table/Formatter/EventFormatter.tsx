import {
	IconArrowsCross,
	IconBolt,
	IconBoltOff,
	IconDisc,
	IconLock,
	IconRefresh,
	IconShield,
	IconUser,
} from "@tabler/icons-react";
import cn from "classnames";
import type { AuditLog } from "src/api/backend";
import { useLocaleState } from "src/context";
import { formatDateTime, intl, T } from "src/locale";

const getEventValue = (event: AuditLog) => {
	switch (event.objectType) {
		case "access-list":
		case "user":
			return event.meta?.name;
		case "proxy-host":
		case "redirection-host":
		case "dead-host":
			return event.meta?.domainNames?.join(", ") || "N/A";
		case "stream":
			return event.meta?.incomingPort || "N/A";
		case "certificate":
			return event.meta?.domainNames?.join(", ") || event.meta?.niceName || "N/A";
		case "nginx-config":
			if (event.meta?.error) {
				// a run that failed half way has the counts of what it did until then
				return typeof event.meta.checked === "number"
					? intl.formatMessage(
							{ id: "settings.nginx.regenerate.audit-partial" },
							{ checked: event.meta.checked, offline: event.meta.offline ?? 0 },
						)
					: intl.formatMessage({ id: "settings.nginx.regenerate.audit-failed" });
			}
			return intl.formatMessage(
				{ id: "settings.nginx.regenerate.audit" },
				{ checked: event.meta?.checked ?? 0, offline: event.meta?.offline ?? 0 },
			);
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
	const failed = row.objectType === "nginx-config" && !!row.meta?.error;
	const c = cn(failed ? "text-red" : getColorForAction(row.action), "me-1");
	let ico = null;
	switch (row.objectType) {
		case "user":
			ico = <IconUser size={16} className={c} />;
			break;
		case "proxy-host":
			ico = <IconBolt size={16} className={c} />;
			break;
		case "redirection-host":
			ico = <IconArrowsCross size={16} className={c} />;
			break;
		case "dead-host":
			ico = <IconBoltOff size={16} className={c} />;
			break;
		case "stream":
			ico = <IconDisc size={16} className={c} />;
			break;
		case "access-list":
			ico = <IconLock size={16} className={c} />;
			break;
		case "certificate":
			ico = <IconShield size={16} className={c} />;
			break;
		case "nginx-config":
			ico = <IconRefresh size={16} className={c} />;
			break;
	}

	return ico;
};

interface Props {
	row: AuditLog;
}
export function EventFormatter({ row }: Props) {
	const { locale } = useLocaleState();
	return (
		<div className="flex-fill">
			<div className="font-weight-medium">
				{getIcon(row)}
				<T id={`object.event.${row.action}`} tData={{ object: row.objectType }} />
				&nbsp; &mdash; <span className="badge">{getEventValue(row)}</span>
			</div>
			<div className="text-secondary mt-1">{formatDateTime(row.createdOn, locale)}</div>
		</div>
	);
}
