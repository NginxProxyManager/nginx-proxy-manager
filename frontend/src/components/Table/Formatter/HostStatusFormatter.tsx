import { IconFileText } from "@tabler/icons-react";
import cn from "classnames";
import { type PointerEvent, useEffect, useRef, useState } from "react";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Popover from "react-bootstrap/Popover";
import type { HostMeta, UpstreamHealthTarget, UpstreamHostHealth } from "src/api/backend";
import { useLocaleState } from "src/context";
import { formatDateTime, intl, T } from "src/locale";
import { getHostStatus, type HostState, isTranslatedCheckCode } from "src/modules/HostStatus";
import { HostNginxError } from "../../NginxFeedback";
import { LocationStatusDetail } from "../../StatusBadges";

const STATE_COLOR: Record<HostState, string> = {
	disabled: "secondary",
	online: "lime",
	warning: "yellow",
	error: "red",
};

const STATE_LABEL: Record<HostState, string> = {
	disabled: "disabled",
	online: "online",
	warning: "host-status.warning",
	error: "host-status.error",
};

// Keeps the popover open while the pointer moves from the badge into it
const HIDE_DELAY_MS = 200;

export const describeHealthTarget = (t: UpstreamHealthTarget) => {
	const where =
		t.locationIndex === null || typeof t.locationIndex === "undefined"
			? intl.formatMessage({ id: "host-status.main-target" })
			: t.path || `#${t.locationIndex + 1}`;
	const reason = isTranslatedCheckCode(t.code) ? intl.formatMessage({ id: `upstream.check.${t.code}` }) : t.message;
	return { where, target: `${t.host}:${t.port}`, reason: reason || t.message };
};

interface Props {
	enabled: boolean;
	meta?: HostMeta | null;
	health?: UpstreamHostHealth | null;
	// When given, the popover offers a link to the host's error log
	onLogs?: () => void;
}
export function HostStatusFormatter({ enabled, meta, health, onLogs }: Props) {
	const { locale } = useLocaleState();
	const [show, setShow] = useState(false);
	const hideTimer = useRef<number | null>(null);
	const status = getHostStatus(enabled, meta, health);
	const hasDetails = status.state === "error" || status.state === "warning";

	useEffect(
		() => () => {
			if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
		},
		[],
	);

	const badge = (
		<span className={cn("status", `status-${STATE_COLOR[status.state]}`)}>
			<span className={cn("status-dot", { "status-dot-animated": status.state !== "disabled" })} />
			<T id={STATE_LABEL[status.state]} />
		</span>
	);

	if (!hasDetails) {
		return badge;
	}

	const cancelHide = () => {
		if (hideTimer.current !== null) {
			window.clearTimeout(hideTimer.current);
			hideTimer.current = null;
		}
	};
	const open = () => {
		cancelHide();
		setShow(true);
	};
	const scheduleHide = () => {
		cancelHide();
		hideTimer.current = window.setTimeout(() => setShow(false), HIDE_DELAY_MS);
	};
	// Hover only for real mouse pointers: touch devices emulate mouseenter on
	// tap, which would fight with the click toggle.
	const hoverOpen = (e: PointerEvent<HTMLElement>) => {
		if (e.pointerType === "mouse") open();
	};
	const hoverHide = (e: PointerEvent<HTMLElement>) => {
		if (e.pointerType === "mouse") scheduleHide();
	};

	const popover = (
		<Popover onPointerEnter={hoverOpen} onPointerLeave={hoverHide} data-testid="host-status-popover">
			<Popover.Header as="h3">
				<T id={STATE_LABEL[status.state]} />
			</Popover.Header>
			<Popover.Body>
				<ul className="list-unstyled mb-0">
					{status.state === "error" ? (
						<li className="mb-2">
							<div className="fw-bold">
								{/* nginx may still serve the host with its previous config: then it isn't offline */}
								<T
									id={
										meta?.nginxDetails?.previousConfigRunning
											? "host-status.previous-config-running"
											: "host-status.config-error"
									}
								/>
							</div>
							<HostNginxError
								meta={meta}
								detailClassName="d-block text-break text-secondary"
								showPreviousConfig={false}
							/>
						</li>
					) : null}
					{status.problemLocations.map((l) => (
						<li key={`loc-${l.index}`} className="mb-2">
							<div>
								<code>{l.path}</code>{" "}
								<span
									className={cn("badge", l.status === "quarantined" ? "bg-red-lt" : "bg-yellow-lt")}
								>
									<T id={`location-status.${l.status}`} />
								</span>
							</div>
							<div className="text-secondary text-break">
								<LocationStatusDetail location={l} />
							</div>
						</li>
					))}
					{status.unhealthyTargets.map((t, i) => {
						const d = describeHealthTarget(t);
						return (
							<li key={`health-${i}`} className="mb-2">
								<div>
									<T
										id={t.code === "resolver_mismatch" ? "host-status.resolver-only" : "host-status.unreachable"}
										data={{ where: d.where, target: d.target }}
									/>
								</div>
								<div className="text-secondary text-break">{d.reason}</div>
							</li>
						);
					})}
				</ul>
				{meta?.nginxCheckedAt ? (
					<div className="text-secondary small mt-1">
						<T id="host-status.checked-at" data={{ date: formatDateTime(meta.nginxCheckedAt, locale) }} />
					</div>
				) : null}
				{onLogs ? (
					<button
						type="button"
						className="btn btn-sm mt-2"
						onClick={() => {
							setShow(false);
							onLogs();
						}}
					>
						<IconFileText size={16} className="me-1" />
						<T id="host-status.view-error-log" />
					</button>
				) : null}
			</Popover.Body>
		</Popover>
	);

	// Controlled, so that hover (desktop) and tap (touch, no hover) both work,
	// and a tap outside closes it again.
	return (
		<OverlayTrigger
			trigger="click"
			placement="auto"
			rootClose
			show={show}
			onToggle={(next) => (next ? open() : setShow(false))}
			overlay={popover}
		>
			<button
				type="button"
				className="btn btn-link p-0 text-reset text-decoration-none"
				aria-expanded={show}
				onPointerEnter={hoverOpen}
				onPointerLeave={hoverHide}
			>
				{badge}
				{/* Announced after the visible state, e.g. "Error, show status details" */}
				<span className="visually-hidden">
					, <T id="host-status.details" />
				</span>
			</button>
		</OverlayTrigger>
	);
}
