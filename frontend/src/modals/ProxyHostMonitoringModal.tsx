import {
	IconActivity,
	IconArrowLeft,
	IconCalendar,
	IconChartBar,
	IconClock,
	IconDatabase,
	IconHelpCircle,
	IconRefresh,
	IconSettings,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { defineMessages } from "react-intl";
import {
	Area,
	ComposedChart,
	CartesianGrid,
	Legend,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import {
	Alert,
	Button,
	ButtonGroup,
	Dropdown,
	Form,
	Modal,
	OverlayTrigger,
	Tooltip as BootstrapTooltip,
} from "react-bootstrap";
import {
	getProxyHostMonitoring,
	getProxyHostMonitoringTimeseries,
	probeProxyHost,
	type ProxyHostMonitoringConfig,
	updateProxyHostMonitoring,
} from "src/api/backend";
import { intl } from "src/locale";

interface Props extends InnerModalProps {
	hostId: number;
	label: string;
}

type TimeRangePreset = "15m" | "1h" | "6h" | "24h" | "7d" | "custom";
type MonitoringScreen = "dashboard" | "settings";
type MetricAccent = "blue" | "green" | "orange" | "purple";
type RefreshInterval = 5_000 | 15_000 | 30_000 | 60_000 | 300_000 | 900_000 | null;

interface MonitoringRange {
	preset: TimeRangePreset;
	from: string;
	to: string;
}

const monitoringMessages = defineMessages({
	action: { id: "proxy-host.monitoring.action", defaultMessage: "Monitoring" },
	activeCheckDescription: {
		id: "proxy-host.monitoring.active-check-description",
		defaultMessage: "Run scheduled probes and update the service health state.",
	},
	activeProbe: { id: "proxy-host.monitoring.active-probe", defaultMessage: "Active probe" },
	autoRefresh: { id: "proxy-host.monitoring.auto-refresh", defaultMessage: "Auto refresh" },
	refresh: { id: "proxy-host.monitoring.refresh", defaultMessage: "Refresh" },
	refreshOff: { id: "proxy-host.monitoring.refresh-off", defaultMessage: "Off" },
	backToDashboard: { id: "proxy-host.monitoring.back-to-dashboard", defaultMessage: "Back to dashboard" },
	checkNow: { id: "proxy-host.monitoring.check-now", defaultMessage: "Check now" },
	checking: { id: "proxy-host.monitoring.checking", defaultMessage: "Checking…" },
	collectRequestMetrics: {
		id: "proxy-host.monitoring.collect-request-metrics",
		defaultMessage: "Collect request metrics",
	},
	collection: { id: "proxy-host.monitoring.collection", defaultMessage: "Data collection" },
	customRange: { id: "proxy-host.monitoring.custom-range", defaultMessage: "Custom range" },
	dashboard: { id: "proxy-host.monitoring.dashboard", defaultMessage: "Monitoring dashboard" },
	enable: { id: "proxy-host.monitoring.enable", defaultMessage: "Enable monitoring" },
	enableDescription: {
		id: "proxy-host.monitoring.enable-description",
		defaultMessage: "Turn service monitoring and health evaluation on or off.",
	},
	interval: { id: "proxy-host.monitoring.interval", defaultMessage: "Interval (seconds)" },
	invalidRange: {
		id: "proxy-host.monitoring.invalid-range",
		defaultMessage: "The start time must be before the end time.",
	},
	loading: { id: "proxy-host.monitoring.loading", defaultMessage: "Loading monitoring data…" },
	metric5xxRatio: { id: "proxy-host.monitoring.metric.5xx-ratio", defaultMessage: "5xx ratio" },
	metricBodyTraffic: { id: "proxy-host.monitoring.metric.body-traffic", defaultMessage: "Response body" },
	metricClientErrors: { id: "proxy-host.monitoring.metric.client-errors", defaultMessage: "4xx errors" },
	metricConsecutiveFailures: {
		id: "proxy-host.monitoring.metric.consecutive-failures",
		defaultMessage: "Consecutive failures",
	},
	metricConsecutiveSuccesses: {
		id: "proxy-host.monitoring.metric.consecutive-successes",
		defaultMessage: "Consecutive successes",
	},
	metricGatewayErrors: { id: "proxy-host.monitoring.metric.gateway-errors", defaultMessage: "Gateway errors" },
	metricHttpStatus: { id: "proxy-host.monitoring.metric.http-status", defaultMessage: "HTTP status" },
	metricLastChecked: { id: "proxy-host.monitoring.metric.last-checked", defaultMessage: "Last checked" },
	metricLastEvent: { id: "proxy-host.monitoring.metric.last-event", defaultMessage: "Last request" },
	metricLastFailure: { id: "proxy-host.monitoring.metric.last-failure", defaultMessage: "Last failure" },
	metricLastProbe: { id: "proxy-host.monitoring.metric.last-probe", defaultMessage: "Last probe" },
	metricLastSuccess: { id: "proxy-host.monitoring.metric.last-success", defaultMessage: "Last success" },
	metricP95Latency: { id: "proxy-host.monitoring.metric.p95-latency", defaultMessage: "p95 latency" },
	metricRequests: { id: "proxy-host.monitoring.metric.requests", defaultMessage: "Requests" },
	metricServerErrors: { id: "proxy-host.monitoring.metric.server-errors", defaultMessage: "5xx errors" },
	metricSyntheticRequests: {
		id: "proxy-host.monitoring.metric.synthetic-requests",
		defaultMessage: "Synthetic requests",
	},
	metricTraffic: { id: "proxy-host.monitoring.metric.traffic", defaultMessage: "Traffic" },
	metricWorkerSeen: { id: "proxy-host.monitoring.metric.worker-seen", defaultMessage: "Worker last seen" },
	noData: { id: "proxy-host.monitoring.no-data", defaultMessage: "No monitoring data for this time range." },
	noProbeResult: { id: "proxy-host.monitoring.no-probe-result", defaultMessage: "No probe result yet" },
	passiveNotApplied: {
		id: "proxy-host.monitoring.passive-not-applied",
		defaultMessage: "The deployed Nginx configuration has not confirmed passive metrics yet.",
	},
	performance: { id: "proxy-host.monitoring.performance", defaultMessage: "Latency and traffic" },
	performanceLatency: { id: "proxy-host.monitoring.performance.latency", defaultMessage: "p95 latency (ms)" },
	performanceTraffic: { id: "proxy-host.monitoring.performance.traffic", defaultMessage: "Traffic" },
	probeHealth: { id: "proxy-host.monitoring.probe-health", defaultMessage: "Probe health" },
	probeMode: { id: "proxy-host.monitoring.probe-mode", defaultMessage: "Probe mode" },
	probeModeBoth: { id: "proxy-host.monitoring.probe-mode.both", defaultMessage: "Both" },
	probeModeEndToEnd: { id: "proxy-host.monitoring.probe-mode.end-to-end", defaultMessage: "End-to-end" },
	probeModeHelp: { id: "proxy-host.monitoring.probe-mode.help", defaultMessage: "Probe mode descriptions" },
	probeModeHelpBoth: {
		id: "proxy-host.monitoring.probe-mode.help.both",
		defaultMessage: "Runs HTTP upstream and end-to-end checks. Both must succeed.",
	},
	probeModeHelpEndToEnd: {
		id: "proxy-host.monitoring.probe-mode.help.end-to-end",
		defaultMessage:
			"Requests local Nginx with the configured hostname and SNI to validate TLS, routing, and the upstream response.",
	},
	probeModeHelpHttp: {
		id: "proxy-host.monitoring.probe-mode.help.http",
		defaultMessage:
			"Sends an HTTP request directly to the upstream and checks its response; Nginx routing and certificates are not tested.",
	},
	probeModeHelpTcp: {
		id: "proxy-host.monitoring.probe-mode.help.tcp",
		defaultMessage: "Checks whether a TCP connection to the upstream host and port can be established.",
	},
	probeModeHelpTls: {
		id: "proxy-host.monitoring.probe-mode.help.tls",
		defaultMessage:
			"Checks a direct TLS handshake with the upstream; certificate validation follows the TLS verification setting.",
	},
	probeModeHttp: { id: "proxy-host.monitoring.probe-mode.http", defaultMessage: "HTTP upstream" },
	range15m: { id: "proxy-host.monitoring.range.15m", defaultMessage: "15 min" },
	range1h: { id: "proxy-host.monitoring.range.1h", defaultMessage: "1 hour" },
	range6h: { id: "proxy-host.monitoring.range.6h", defaultMessage: "6 hours" },
	range24h: { id: "proxy-host.monitoring.range.24h", defaultMessage: "24 hours" },
	range7d: { id: "proxy-host.monitoring.range.7d", defaultMessage: "7 days" },
	recentActivity: { id: "proxy-host.monitoring.recent-activity", defaultMessage: "Recent activity" },
	requestBreakdown: { id: "proxy-host.monitoring.request-breakdown", defaultMessage: "Request breakdown" },
	requestMetricsDescription: {
		id: "proxy-host.monitoring.request-metrics-description",
		defaultMessage: "Read request, error, latency, and traffic metrics from Nginx logs.",
	},
	requestVolume: { id: "proxy-host.monitoring.request-volume", defaultMessage: "Request volume and errors" },
	requestVolumeClientErrors: {
		id: "proxy-host.monitoring.request-volume.client-errors",
		defaultMessage: "4xx errors",
	},
	requestVolumeRequests: { id: "proxy-host.monitoring.request-volume.requests", defaultMessage: "Requests" },
	requestVolumeServerErrors: {
		id: "proxy-host.monitoring.request-volume.server-errors",
		defaultMessage: "5xx errors",
	},
	runActiveChecks: { id: "proxy-host.monitoring.run-active-checks", defaultMessage: "Run active checks" },
	saveSettings: { id: "proxy-host.monitoring.save-settings", defaultMessage: "Save settings" },
	saving: { id: "proxy-host.monitoring.saving", defaultMessage: "Saving…" },
	settings: { id: "proxy-host.monitoring.settings", defaultMessage: "Monitoring settings" },
	settingsDescription: {
		id: "proxy-host.monitoring.settings-description",
		defaultMessage: "Configure collection and active-check behavior without leaving the monitoring dashboard.",
	},
	statusLabel: { id: "proxy-host.monitoring.status-label", defaultMessage: "Status" },
	statusConfigError: { id: "proxy-host.monitoring.status.config-error", defaultMessage: "Configuration error" },
	statusDegraded: { id: "proxy-host.monitoring.status.degraded", defaultMessage: "Degraded" },
	statusDisabled: { id: "proxy-host.monitoring.status.disabled", defaultMessage: "Disabled" },
	statusOffline: { id: "proxy-host.monitoring.status.offline", defaultMessage: "Offline" },
	statusOnline: { id: "proxy-host.monitoring.status.online", defaultMessage: "Online" },
	statusUnknown: { id: "proxy-host.monitoring.status.unknown", defaultMessage: "Unknown" },
	timeEnd: { id: "proxy-host.monitoring.time-end", defaultMessage: "End time" },
	timeStart: { id: "proxy-host.monitoring.time-start", defaultMessage: "Start time" },
	timeRange: { id: "proxy-host.monitoring.time-range", defaultMessage: "Time range" },
	timeRangeApply: { id: "proxy-host.monitoring.time-range.apply", defaultMessage: "Apply" },
	timeRangeSummary: {
		id: "proxy-host.monitoring.time-range.summary",
		defaultMessage: "Metrics for the selected time range",
	},
	timeout: { id: "proxy-host.monitoring.timeout", defaultMessage: "Timeout (ms)" },
});

const message = (key: keyof typeof monitoringMessages) => intl.formatMessage(monitoringMessages[key]);
const statusMessages = {
	disabled: monitoringMessages.statusDisabled,
	unknown: monitoringMessages.statusUnknown,
	online: monitoringMessages.statusOnline,
	degraded: monitoringMessages.statusDegraded,
	offline: monitoringMessages.statusOffline,
	config_error: monitoringMessages.statusConfigError,
} as const;
const PRESET_DURATION_MS = {
	"15m": 900_000,
	"1h": 3_600_000,
	"6h": 21_600_000,
	"24h": 86_400_000,
	"7d": 604_800_000,
} as const;
const RANGE_OPTIONS = [
	["15m", "range15m"],
	["1h", "range1h"],
	["6h", "range6h"],
	["24h", "range24h"],
	["7d", "range7d"],
] as const;
const REFRESH_OPTIONS: ReadonlyArray<[RefreshInterval, string]> = [
	[null, "Off"],
	[5_000, "5s"],
	[15_000, "15s"],
	[30_000, "30s"],
	[60_000, "1m"],
	[300_000, "5m"],
	[900_000, "15m"],
];
const refreshIntervalLabel = (interval: RefreshInterval) => {
	if (interval === null) return message("refreshOff");
	return REFRESH_OPTIONS.find(([value]) => value === interval)?.[1] ?? message("refreshOff");
};

const createRange = (preset: Exclude<TimeRangePreset, "custom">): MonitoringRange => {
	const end = new Date();
	return { preset, from: new Date(end.getTime() - PRESET_DURATION_MS[preset]).toISOString(), to: end.toISOString() };
};
const toDateTimeLocal = (value: string) => {
	const date = new Date(value);
	return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const formatBytes = (value = 0) => {
	if (!value) return "0 B";
	const units = ["B", "KiB", "MiB", "GiB", "TiB"];
	const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
	return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
};
const formatDateTime = (value?: string | null) => (value ? new Date(value).toLocaleString() : "—");
const formatDuration = (value?: number | null) => (value === null || value === undefined ? "—" : `${value} ms`);
const statusKey = (status?: string | null) =>
	status && Object.keys(statusMessages).includes(status) ? (status as keyof typeof statusMessages) : "unknown";
const statusLabel = (status?: string | null) => intl.formatMessage(statusMessages[statusKey(status)]);

const metricAccentClasses: Record<MetricAccent, string> = {
	blue: "bg-blue text-white",
	green: "bg-green text-white",
	orange: "bg-yellow text-white",
	purple: "bg-purple text-white",
};

const PrimaryMetric = ({
	accent,
	detail,
	icon,
	label,
	value,
}: {
	accent: MetricAccent;
	detail: string;
	icon: ReactNode;
	label: string;
	value: string | number;
}) => (
	<div className="col-sm-6 col-xl-3">
		<div className="card card-sm h-100">
			<div className="card-body">
				<div className="row align-items-center">
					<div className="col-auto">
						<span className={`avatar ${metricAccentClasses[accent]}`} aria-hidden="true">
							{icon}
						</span>
					</div>
					<div className="col min-w-0">
						<div className="small text-secondary text-truncate">{label}</div>
						<div className="h2 mb-0 text-truncate">{value}</div>
						<div className="small text-secondary text-truncate" title={detail}>
							{detail}
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
);
const DetailItem = ({ label, value }: { label: string; value: string | number }) => (
	<div className="list-group-item px-3 py-2">
		<div className="d-flex align-items-start justify-content-between gap-3">
			<span className="text-secondary">{label}</span>
			<span className="text-end fw-medium text-break" title={String(value)}>
				{value}
			</span>
		</div>
	</div>
);
const ChartEmptyState = () => (
	<div className="monitoring-chart-empty text-secondary">
		<IconChartBar size={28} stroke={1.5} />
		<span>{message("noData")}</span>
	</div>
);
const SettingToggle = ({
	checked,
	help,
	id,
	label,
	onChange,
}: {
	checked: boolean;
	help: string;
	id: string;
	label: string;
	onChange: (checked: boolean) => void;
}) => (
	<label className="row py-2" htmlFor={id}>
		<span className="col">
			<span className="d-block">{label}</span>
			<span className="d-block small text-secondary">{help}</span>
		</span>
		<span className="col-auto">
			<span className="form-check form-check-single form-switch">
				<input
					id={id}
					type="checkbox"
					className={`form-check-input ${checked ? "bg-lime" : ""}`}
					checked={checked}
					onChange={(event) => onChange(event.currentTarget.checked)}
				/>
			</span>
		</span>
	</label>
);

const RefreshPicker = ({
	interval,
	isRefreshing,
	onIntervalChange,
	onRefresh,
}: {
	interval: RefreshInterval;
	isRefreshing: boolean;
	onIntervalChange: (interval: RefreshInterval) => void;
	onRefresh: () => void;
}) => {
	const currentLabel = refreshIntervalLabel(interval);
	return (
		<Dropdown as={ButtonGroup} className="monitoring-refresh-picker">
			<Button
				variant="outline-secondary"
				size="sm"
				onClick={onRefresh}
				disabled={isRefreshing}
				title={message("refresh")}
				aria-label={message("refresh")}
			>
				<IconRefresh size={16} className={isRefreshing ? "monitoring-spin" : ""} />
			</Button>
			<Dropdown.Toggle
				variant="outline-secondary"
				size="sm"
				id="monitoring-refresh-picker"
				aria-label={`${message("autoRefresh")}: ${currentLabel}`}
			>
				{currentLabel}
			</Dropdown.Toggle>
			<Dropdown.Menu align="end">
				<Dropdown.Header>{message("autoRefresh")}</Dropdown.Header>
				{REFRESH_OPTIONS.map(([value, label]) => (
					<Dropdown.Item
						key={value ?? "off"}
						as="button"
						active={interval === value}
						onClick={() => onIntervalChange(value)}
					>
						{value === null ? message("refreshOff") : label}
					</Dropdown.Item>
				))}
			</Dropdown.Menu>
		</Dropdown>
	);
};

const showProxyHostMonitoringModal = (hostId: number, label: string) =>
	EasyModal.show(ProxyHostMonitoringModal, { hostId, label });

const ProxyHostMonitoringModal = EasyModal.create(({ hostId, label, visible, remove }: Props) => {
	const queryClient = useQueryClient();
	const [screen, setScreen] = useState<MonitoringScreen>("dashboard");
	const [config, setConfig] = useState<ProxyHostMonitoringConfig | null>(null);
	const [range, setRange] = useState<MonitoringRange>(() => createRange("1h"));
	const [customFrom, setCustomFrom] = useState(() => toDateTimeLocal(range.from));
	const [customTo, setCustomTo] = useState(() => toDateTimeLocal(range.to));
	const [showCustomRange, setShowCustomRange] = useState(false);
	const [refreshInterval, setRefreshInterval] = useState<RefreshInterval>(15_000);
	const rangeParams = useMemo(() => ({ from: range.from, to: range.to }), [range.from, range.to]);
	const resolution = range.preset === "24h" || range.preset === "7d" ? "hour" : "minute";
	const isCustomRangeValid = Boolean(customFrom && customTo && new Date(customFrom) <= new Date(customTo));

	const snapshot = useQuery({
		queryKey: ["proxy-host-monitoring", hostId, rangeParams],
		queryFn: () => getProxyHostMonitoring(hostId, rangeParams),
		placeholderData: (previousData) => previousData,
		refetchInterval:
			screen === "dashboard" && refreshInterval && range.preset === "custom" ? refreshInterval : false,
	});
	const timeseries = useQuery({
		queryKey: ["proxy-host-monitoring-timeseries", hostId, rangeParams, resolution],
		queryFn: () => getProxyHostMonitoringTimeseries(hostId, { ...rangeParams, resolution }),
		placeholderData: (previousData) => previousData,
		refetchInterval:
			screen === "dashboard" && refreshInterval && range.preset === "custom" ? refreshInterval : false,
	});
	useEffect(() => {
		if (snapshot.data?.config) setConfig(snapshot.data.config);
	}, [snapshot.data?.config]);
	useEffect(() => {
		if (!refreshInterval || screen !== "dashboard" || range.preset === "custom") return;
		const timer = window.setInterval(() => {
			setRange((current) => (current.preset === "custom" ? current : createRange(current.preset)));
		}, refreshInterval);
		return () => window.clearInterval(timer);
	}, [refreshInterval, range.preset, screen]);

	const save = useMutation({
		mutationFn: (payload: Partial<ProxyHostMonitoringConfig>) => updateProxyHostMonitoring(hostId, payload),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["proxy-host-monitoring", hostId] });
			queryClient.invalidateQueries({ queryKey: ["proxy-hosts"] });
			setScreen("dashboard");
		},
	});
	const probe = useMutation({
		mutationFn: () => probeProxyHost(hostId),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["proxy-host-monitoring", hostId] }),
	});

	const data = snapshot.data;
	const state = data?.state;
	const summary = data?.summary;
	const currentStatus = statusKey(state?.status);
	const chartData = (timeseries.data || []).map((point) => ({
		bucketStart: point.bucketStart,
		requests: point.requests,
		clientErrors: point.clientErrors,
		serverErrors: point.serverErrors,
		bytesSent: point.bytesSent,
		p95RequestTimeMs: point.p95RequestTimeMs,
	}));
	const selectedRange = `${formatDateTime(range.from)} – ${formatDateTime(range.to)}`;
	const isRefreshing = snapshot.isFetching || timeseries.isFetching;
	const refreshMonitoring = () => {
		if (range.preset !== "custom") {
			const nextRange = createRange(range.preset);
			setRange(nextRange);
			setCustomFrom(toDateTimeLocal(nextRange.from));
			setCustomTo(toDateTimeLocal(nextRange.to));
			return;
		}
		void Promise.all([snapshot.refetch(), timeseries.refetch()]);
	};
	const changeRefreshInterval = (interval: RefreshInterval) => {
		setRefreshInterval(interval);
		if (interval !== null) refreshMonitoring();
	};
	const formatChartTime = (value: string) =>
		new Date(value).toLocaleString([], {
			month: range.preset === "7d" ? "numeric" : undefined,
			day: range.preset === "7d" ? "numeric" : undefined,
			hour: "2-digit",
			minute: "2-digit",
		});
	const selectPreset = (preset: Exclude<TimeRangePreset, "custom">) => {
		const nextRange = createRange(preset);
		setRange(nextRange);
		setCustomFrom(toDateTimeLocal(nextRange.from));
		setCustomTo(toDateTimeLocal(nextRange.to));
		setShowCustomRange(false);
	};
	const applyCustomRange = () => {
		if (!isCustomRangeValid) return;
		setRange({ preset: "custom", from: new Date(customFrom).toISOString(), to: new Date(customTo).toISOString() });
		setShowCustomRange(false);
	};
	const changeConfig = <Key extends keyof ProxyHostMonitoringConfig>(
		key: Key,
		value: ProxyHostMonitoringConfig[Key],
	) => {
		setConfig((current) => (current ? { ...current, [key]: value } : current));
	};
	const submit = () => {
		if (!config) return;
		save.mutate({
			enabled: config.enabled,
			passiveDesiredEnabled: config.passiveDesiredEnabled,
			activeEnabled: config.activeEnabled,
			probeMode: config.probeMode,
			intervalSeconds: config.intervalSeconds,
			timeoutMs: config.timeoutMs,
		});
	};
	const probeModeHelp = (
		<BootstrapTooltip id="monitoring-probe-mode-help">
			<div className="text-start">
				<div>
					<strong>TCP</strong> — {message("probeModeHelpTcp")}
				</div>
				<div className="mt-1">
					<strong>TLS</strong> — {message("probeModeHelpTls")}
				</div>
				<div className="mt-1">
					<strong>{message("probeModeHttp")}</strong> — {message("probeModeHelpHttp")}
				</div>
				<div className="mt-1">
					<strong>{message("probeModeEndToEnd")}</strong> — {message("probeModeHelpEndToEnd")}
				</div>
				<div className="mt-1">
					<strong>{message("probeModeBoth")}</strong> — {message("probeModeHelpBoth")}
				</div>
			</div>
		</BootstrapTooltip>
	);
	const tooltipStyle = {
		backgroundColor: "var(--tblr-bg-surface, #fff)",
		color: "var(--tblr-body-color, #182433)",
		borderColor: "var(--tblr-border-color, #d9dce1)",
		borderRadius: "0.5rem",
		boxShadow: "0 8px 24px rgba(0, 0, 0, 0.08)",
	};

	return (
		<Modal show={visible} onHide={remove} size="xl" scrollable>
			<Modal.Header closeButton>
				<Modal.Title>
					<span className="d-block">
						{screen === "dashboard" ? message("dashboard") : message("settings")}
					</span>
					<span className="d-block small text-secondary fw-normal">{label}</span>
				</Modal.Title>
			</Modal.Header>
			<Modal.Body>
				{snapshot.isLoading ? (
					<div className="monitoring-loading-state text-secondary">
						<span className="spinner-border spinner-border-sm" />
						{message("loading")}
					</div>
				) : null}
				{snapshot.error ? <Alert variant="danger">{snapshot.error.message}</Alert> : null}
				{timeseries.error ? <Alert variant="danger">{timeseries.error.message}</Alert> : null}
				{save.error ? <Alert variant="danger">{save.error.message}</Alert> : null}

				{data && screen === "dashboard" ? (
					<div className="monitoring-dashboard">
						<div className="card">
							<div className="card-body">
								<div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
									<div className="min-w-0">
										<div className="d-flex flex-wrap align-items-center gap-2 mb-1">
											<h3 className="mb-0 text-truncate">{label}</h3>
											<span
												className={`status monitoring-status-indicator monitoring-status-indicator-${currentStatus}`}
											>
												<span className="status-dot" />
												{statusLabel(currentStatus)}
											</span>
										</div>
										<div className="text-secondary">
											{state?.statusReason || message("noProbeResult")}
										</div>
										<div className="d-flex flex-wrap gap-3 mt-2 small text-secondary">
											<span className="d-inline-flex align-items-center gap-1">
												<IconClock size={14} />
												{message("metricLastChecked")}: {formatDateTime(state?.lastCheckedOn)}
											</span>
											{refreshInterval ? (
												<span className="d-inline-flex align-items-center gap-1">
													<IconRefresh
														size={14}
														className={isRefreshing ? "monitoring-spin" : ""}
													/>
													{message("autoRefresh")}
												</span>
											) : null}
										</div>
									</div>
									<div className="btn-list">
										<button
											type="button"
											className="btn btn-sm btn-outline-secondary"
											onClick={() => probe.mutate()}
											disabled={probe.isPending}
										>
											<IconRefresh
												size={16}
												className={probe.isPending ? "monitoring-spin me-1" : "me-1"}
											/>
											{probe.isPending ? message("checking") : message("checkNow")}
										</button>
										<button
											type="button"
											className="btn btn-sm btn-primary"
											onClick={() => setScreen("settings")}
										>
											<IconSettings size={16} className="me-1" />
											{message("settings")}
										</button>
									</div>
								</div>
							</div>
						</div>

						<div className="card">
							<div className="card-body py-3">
								<div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
									<div className="d-flex align-items-center gap-2 min-w-0">
										<IconCalendar size={18} className="text-secondary flex-shrink-0" />
										<div className="min-w-0">
											<div className="small text-secondary">{message("timeRangeSummary")}</div>
											<div className="small fw-medium monitoring-range-value">
												{selectedRange}
											</div>
										</div>
									</div>
									<div className="d-flex flex-wrap gap-2">
										<div
											className="btn-group monitoring-range-presets"
											role="group"
											aria-label={message("timeRange")}
										>
											{RANGE_OPTIONS.map(([preset, messageKey]) => (
												<button
													key={preset}
													type="button"
													className={`btn btn-sm ${range.preset === preset ? "btn-primary" : "btn-outline-secondary"}`}
													onClick={() => selectPreset(preset)}
												>
													{message(messageKey)}
												</button>
											))}
										</div>
										<button
											type="button"
											className={`btn btn-sm ${range.preset === "custom" ? "btn-primary" : "btn-outline-secondary"}`}
											onClick={() => setShowCustomRange((value) => !value)}
											aria-expanded={showCustomRange}
											aria-controls="monitoring-custom-range"
										>
											<IconCalendar size={15} className="me-1" />
											{message("customRange")}
										</button>
										<RefreshPicker
											interval={refreshInterval}
											isRefreshing={isRefreshing}
											onIntervalChange={changeRefreshInterval}
											onRefresh={refreshMonitoring}
										/>
									</div>
								</div>
								{showCustomRange ? (
									<div
										className="monitoring-custom-range border-top mt-3 pt-3"
										id="monitoring-custom-range"
									>
										<Form.Group className="monitoring-custom-range-field">
											<Form.Label>{message("timeStart")}</Form.Label>
											<Form.Control
												size="sm"
												type="datetime-local"
												value={customFrom}
												max={customTo || undefined}
												onChange={(event) => setCustomFrom(event.target.value)}
											/>
										</Form.Group>
										<Form.Group className="monitoring-custom-range-field">
											<Form.Label>{message("timeEnd")}</Form.Label>
											<Form.Control
												size="sm"
												type="datetime-local"
												value={customTo}
												min={customFrom || undefined}
												onChange={(event) => setCustomTo(event.target.value)}
											/>
										</Form.Group>
										<button
											type="button"
											className="btn btn-sm btn-primary"
											disabled={!isCustomRangeValid}
											onClick={applyCustomRange}
										>
											{message("timeRangeApply")}
										</button>
										{customFrom && customTo && !isCustomRangeValid ? (
											<div className="text-danger small w-100">{message("invalidRange")}</div>
										) : null}
									</div>
								) : null}
							</div>
						</div>

						<div className="row row-cards">
							<PrimaryMetric
								accent="blue"
								icon={<IconChartBar size={22} />}
								label={message("metricRequests")}
								value={(summary?.requests ?? 0).toLocaleString()}
								detail={`${message("metricSyntheticRequests")}: ${(summary?.syntheticRequests ?? 0).toLocaleString()}`}
							/>
							<PrimaryMetric
								accent="orange"
								icon={<IconActivity size={22} />}
								label={message("metric5xxRatio")}
								value={`${((summary?.errorRatio ?? 0) * 100).toFixed(1)}%`}
								detail={`${message("metricServerErrors")}: ${(summary?.serverErrors ?? 0).toLocaleString()}`}
							/>
							<PrimaryMetric
								accent="purple"
								icon={<IconClock size={22} />}
								label={message("metricP95Latency")}
								value={formatDuration(summary?.p95RequestTimeMs)}
								detail={`${message("metricHttpStatus")}: ${state?.lastHttpStatus ?? "—"}`}
							/>
							<PrimaryMetric
								accent="green"
								icon={<IconDatabase size={22} />}
								label={message("metricTraffic")}
								value={formatBytes(summary?.bytesSent)}
								detail={`${message("metricBodyTraffic")}: ${formatBytes(summary?.bodyBytesSent)}`}
							/>
						</div>

						<div className="row row-cards">
							<div className="col-xl-7">
								<div className="card h-100">
									<div className="card-header">
										<div>
											<h3 className="card-title">{message("requestVolume")}</h3>
											<div className="small text-secondary">{selectedRange}</div>
										</div>
									</div>
									<div className="card-body pt-2">
										<div className="monitoring-request-chart">
											{chartData.length ? (
												<ResponsiveContainer width="100%" height="100%">
													<ComposedChart
														data={chartData}
														margin={{ top: 12, right: 10, bottom: 2, left: -8 }}
													>
														<defs>
															<linearGradient
																id="monitoring-request-fill"
																x1="0"
																y1="0"
																x2="0"
																y2="1"
															>
																<stop
																	offset="5%"
																	stopColor="#206bc4"
																	stopOpacity={0.22}
																/>
																<stop
																	offset="95%"
																	stopColor="#206bc4"
																	stopOpacity={0.02}
																/>
															</linearGradient>
														</defs>
														<CartesianGrid
															stroke="var(--tblr-border-color, #d9dce1)"
															strokeDasharray="3 5"
															vertical={false}
														/>
														<XAxis
															dataKey="bucketStart"
															minTickGap={48}
															axisLine={false}
															tickLine={false}
															tick={{
																fill: "var(--tblr-secondary, #6c7a91)",
																fontSize: 11,
															}}
															tickFormatter={formatChartTime}
														/>
														<YAxis
															allowDecimals={false}
															axisLine={false}
															tickLine={false}
															width={40}
															tick={{
																fill: "var(--tblr-secondary, #6c7a91)",
																fontSize: 11,
															}}
														/>
														<Tooltip
															labelFormatter={(value) => formatDateTime(String(value))}
															contentStyle={tooltipStyle}
														/>
														<Legend
															verticalAlign="bottom"
															height={28}
															iconType="circle"
															iconSize={7}
															wrapperStyle={{ fontSize: "0.75rem" }}
														/>
														<Area
															type="monotone"
															dataKey="requests"
															name={message("requestVolumeRequests")}
															stroke="#206bc4"
															strokeWidth={2.4}
															fill="url(#monitoring-request-fill)"
															dot={false}
															activeDot={{ r: 4 }}
														/>
														<Line
															type="monotone"
															dataKey="clientErrors"
															name={message("requestVolumeClientErrors")}
															stroke="#f59f00"
															strokeWidth={1.8}
															dot={false}
															activeDot={{ r: 4 }}
														/>
														<Line
															type="monotone"
															dataKey="serverErrors"
															name={message("requestVolumeServerErrors")}
															stroke="#d63939"
															strokeWidth={1.8}
															dot={false}
															activeDot={{ r: 4 }}
														/>
													</ComposedChart>
												</ResponsiveContainer>
											) : (
												<ChartEmptyState />
											)}
										</div>
									</div>
								</div>
							</div>
							<div className="col-xl-5">
								<div className="card h-100">
									<div className="card-header">
										<div>
											<h3 className="card-title">{message("performance")}</h3>
											<div className="small text-secondary">{selectedRange}</div>
										</div>
									</div>
									<div className="card-body pt-2">
										<div className="monitoring-request-chart">
											{chartData.length ? (
												<ResponsiveContainer width="100%" height="100%">
													<LineChart
														data={chartData}
														margin={{ top: 12, right: 4, bottom: 2, left: -8 }}
													>
														<CartesianGrid
															stroke="var(--tblr-border-color, #d9dce1)"
															strokeDasharray="3 5"
															vertical={false}
														/>
														<XAxis
															dataKey="bucketStart"
															minTickGap={48}
															axisLine={false}
															tickLine={false}
															tick={{
																fill: "var(--tblr-secondary, #6c7a91)",
																fontSize: 11,
															}}
															tickFormatter={formatChartTime}
														/>
														<YAxis
															yAxisId="traffic"
															axisLine={false}
															tickLine={false}
															tickFormatter={(value) => formatBytes(Number(value))}
															width={55}
															tick={{
																fill: "var(--tblr-secondary, #6c7a91)",
																fontSize: 11,
															}}
														/>
														<YAxis
															yAxisId="latency"
															orientation="right"
															axisLine={false}
															tickLine={false}
															width={34}
															tick={{
																fill: "var(--tblr-secondary, #6c7a91)",
																fontSize: 11,
															}}
														/>
														<Tooltip
															labelFormatter={(value) => formatDateTime(String(value))}
															formatter={(value, name) => [
																name === message("performanceTraffic")
																	? formatBytes(Number(value))
																	: `${value ?? 0} ms`,
																name,
															]}
															contentStyle={tooltipStyle}
														/>
														<Legend
															verticalAlign="bottom"
															height={28}
															iconType="circle"
															iconSize={7}
															wrapperStyle={{ fontSize: "0.75rem" }}
														/>
														<Line
															yAxisId="traffic"
															type="monotone"
															dataKey="bytesSent"
															name={message("performanceTraffic")}
															stroke="#206bc4"
															strokeWidth={2.2}
															dot={false}
															activeDot={{ r: 4 }}
														/>
														<Line
															yAxisId="latency"
															type="monotone"
															dataKey="p95RequestTimeMs"
															name={message("performanceLatency")}
															stroke="#ae3ec9"
															strokeWidth={2.2}
															dot={false}
															activeDot={{ r: 4 }}
															connectNulls
														/>
													</LineChart>
												</ResponsiveContainer>
											) : (
												<ChartEmptyState />
											)}
										</div>
									</div>
								</div>
							</div>
						</div>

						<div className="row row-cards">
							<div className="col-lg-4">
								<div className="card h-100">
									<div className="card-header">
										<h3 className="card-title">{message("requestBreakdown")}</h3>
									</div>
									<div className="list-group list-group-flush">
										<DetailItem
											label={message("metricSyntheticRequests")}
											value={(summary?.syntheticRequests ?? 0).toLocaleString()}
										/>
										<DetailItem
											label={message("metricClientErrors")}
											value={(summary?.clientErrors ?? 0).toLocaleString()}
										/>
										<DetailItem
											label={message("metricServerErrors")}
											value={(summary?.serverErrors ?? 0).toLocaleString()}
										/>
										<DetailItem
											label={message("metricGatewayErrors")}
											value={(summary?.gatewayErrors ?? 0).toLocaleString()}
										/>
										<DetailItem
											label={message("metricBodyTraffic")}
											value={formatBytes(summary?.bodyBytesSent)}
										/>
									</div>
								</div>
							</div>
							<div className="col-lg-4">
								<div className="card h-100">
									<div className="card-header">
										<h3 className="card-title">{message("probeHealth")}</h3>
									</div>
									<div className="list-group list-group-flush">
										<DetailItem label={message("statusLabel")} value={statusLabel(currentStatus)} />
										<DetailItem
											label={message("metricHttpStatus")}
											value={state?.lastHttpStatus ?? "—"}
										/>
										<DetailItem
											label={message("metricLastProbe")}
											value={formatDuration(state?.lastProbeDurationMs)}
										/>
										<DetailItem
											label={message("metricConsecutiveSuccesses")}
											value={state?.consecutiveSuccesses ?? 0}
										/>
										<DetailItem
											label={message("metricConsecutiveFailures")}
											value={state?.consecutiveFailures ?? 0}
										/>
									</div>
								</div>
							</div>
							<div className="col-lg-4">
								<div className="card h-100">
									<div className="card-header">
										<h3 className="card-title">{message("recentActivity")}</h3>
									</div>
									<div className="list-group list-group-flush">
										<DetailItem
											label={message("metricLastEvent")}
											value={formatDateTime(summary?.lastEventAt)}
										/>
										<DetailItem
											label={message("metricLastChecked")}
											value={formatDateTime(state?.lastCheckedOn)}
										/>
										<DetailItem
											label={message("metricLastSuccess")}
											value={formatDateTime(state?.lastSuccessOn)}
										/>
										<DetailItem
											label={message("metricLastFailure")}
											value={formatDateTime(state?.lastFailureOn)}
										/>
										<DetailItem
											label={message("metricWorkerSeen")}
											value={formatDateTime(state?.workerSeenOn)}
										/>
									</div>
								</div>
							</div>
						</div>
					</div>
				) : null}

				{data && screen === "settings" && config ? (
					<div className="monitoring-settings-page">
						<div>
							<button
								type="button"
								className="btn btn-sm btn-outline-secondary mb-3"
								onClick={() => setScreen("dashboard")}
							>
								<IconArrowLeft size={16} className="me-1" />
								{message("backToDashboard")}
							</button>
							<h3 className="mb-1">{message("settings")}</h3>
							<p className="text-secondary mb-0">{message("settingsDescription")}</p>
						</div>
						<div className="row row-cards">
							<div className="col-lg-5">
								<div className="card h-100">
									<div className="card-header">
										<h3 className="card-title">{message("collection")}</h3>
									</div>
									<div className="card-body">
										<SettingToggle
											id="monitor-enabled"
											label={message("enable")}
											help={message("enableDescription")}
											checked={config.enabled}
											onChange={(checked) => changeConfig("enabled", checked)}
										/>
										<SettingToggle
											id="monitor-passive"
											label={message("collectRequestMetrics")}
											help={message("requestMetricsDescription")}
											checked={config.passiveDesiredEnabled}
											onChange={(checked) => changeConfig("passiveDesiredEnabled", checked)}
										/>
										<SettingToggle
											id="monitor-active"
											label={message("runActiveChecks")}
											help={message("activeCheckDescription")}
											checked={config.activeEnabled}
											onChange={(checked) => changeConfig("activeEnabled", checked)}
										/>
										{!config.passiveAppliedEnabled ? (
											<div className="alert alert-warning py-2 small mb-0 mt-2">
												{message("passiveNotApplied")}
											</div>
										) : null}
									</div>
								</div>
							</div>
							<div className="col-lg-7">
								<div className="card h-100">
									<div className="card-header">
										<h3 className="card-title">{message("activeProbe")}</h3>
									</div>
									<div className="card-body">
										<div className="row g-3">
											<div className="col-12">
												<div className="d-flex align-items-center gap-1 mb-2">
													<Form.Label className="mb-0">{message("probeMode")}</Form.Label>
													<OverlayTrigger
														trigger={["hover", "focus", "click"]}
														placement="top"
														overlay={probeModeHelp}
													>
														<button
															type="button"
															className="btn btn-link btn-sm p-0 text-secondary"
															aria-label={message("probeModeHelp")}
														>
															<IconHelpCircle size={16} stroke={1.8} />
														</button>
													</OverlayTrigger>
												</div>
												<Form.Select
													value={config.probeMode}
													onChange={(event) =>
														changeConfig(
															"probeMode",
															event.target
																.value as ProxyHostMonitoringConfig["probeMode"],
														)
													}
												>
													<option value="tcp">TCP</option>
													<option value="tls">TLS</option>
													<option value="http">{message("probeModeHttp")}</option>
													<option value="end_to_end">{message("probeModeEndToEnd")}</option>
													<option value="both">{message("probeModeBoth")}</option>
												</Form.Select>
											</div>
											<div className="col-sm-6">
												<Form.Label>{message("interval")}</Form.Label>
												<Form.Control
													type="number"
													min={15}
													max={3600}
													value={config.intervalSeconds}
													onChange={(event) =>
														changeConfig("intervalSeconds", Number(event.target.value))
													}
												/>
											</div>
											<div className="col-sm-6">
												<Form.Label>{message("timeout")}</Form.Label>
												<Form.Control
													type="number"
													min={500}
													max={30000}
													value={config.timeoutMs}
													onChange={(event) =>
														changeConfig("timeoutMs", Number(event.target.value))
													}
												/>
											</div>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				) : null}
			</Modal.Body>
			{screen === "settings" ? (
				<Modal.Footer>
					<button
						type="button"
						className="btn btn-primary"
						onClick={submit}
						disabled={!config || save.isPending}
					>
						{save.isPending ? message("saving") : message("saveSettings")}
					</button>
				</Modal.Footer>
			) : null}
		</Modal>
	);
});

export { showProxyHostMonitoringModal };
