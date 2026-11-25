import { IconHome, IconQuestionMark } from "@tabler/icons-react";
import { hasFlag } from "country-flag-icons";
import type { ReactNode } from "react";
import type { TrafficCounts, TrafficReport } from "src/api/backend";
import { Flag } from "src/components/Flag";
import { intl, T } from "src/locale";

export const RANGES = [
	{ hours: 1, label: "1h" },
	{ hours: 6, label: "6h" },
	{ hours: 24, label: "24h" },
	{ hours: 24 * 7, label: "7d" },
	{ hours: 24 * 30, label: "30d" },
];

type Klass = "s2xx" | "s3xx" | "s4xx" | "s5xx";
const CLASSES: Array<{ key: Klass; label: string; color: string; id: string }> = [
	{ key: "s2xx", label: "2xx", color: "var(--tblr-green)", id: "traffic.class.2xx" },
	{ key: "s3xx", label: "3xx", color: "var(--tblr-secondary)", id: "traffic.class.3xx" },
	{ key: "s4xx", label: "4xx", color: "var(--tblr-orange)", id: "traffic.class.4xx" },
	{ key: "s5xx", label: "5xx", color: "var(--tblr-red)", id: "traffic.class.5xx" },
];
const BAR = "var(--tblr-purple)";

const formatBytes = (bytes: number) => {
	const units = ["B", "KB", "MB", "GB", "TB"];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
};

const formatTime = (ts: number, hours: number) => {
	const d = new Date(ts * 1000);
	return hours > 48
		? d.toLocaleDateString([], { month: "short", day: "numeric" })
		: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const stepLabel = (step: number) => {
	if (step >= 86400) return `${Math.round(step / 86400)} d`;
	if (step >= 3600) return `${Math.round(step / 3600)} h`;
	return `${Math.round(step / 60)} min`;
};

const countryName = (code: string) => {
	if (code === "LOCAL") {
		return intl.formatMessage({ id: "traffic.local" });
	}
	if (code === "??") {
		return intl.formatMessage({ id: "traffic.unknown" });
	}
	try {
		return new Intl.DisplayNames([navigator.language], { type: "region" }).of(code) || code;
	} catch {
		return code;
	}
};

// Flag for a country code, a house for the local network, a question mark when unknown
const CountryMark = ({ code }: { code?: string | null }) => {
	if (!code) {
		return null;
	}
	if (code === "LOCAL") {
		return <IconHome size={16} className="text-secondary" />;
	}
	if (hasFlag(code)) {
		return <Flag countryCode={code} className="rounded-1" />;
	}
	return <IconQuestionMark size={16} className="text-secondary" />;
};

const REASONS: Record<number, string> = {
	200: "OK",
	201: "Created",
	202: "Accepted",
	204: "No Content",
	206: "Partial Content",
	301: "Moved Permanently",
	302: "Found",
	303: "See Other",
	304: "Not Modified",
	307: "Temporary Redirect",
	308: "Permanent Redirect",
	400: "Bad Request",
	401: "Unauthorized",
	403: "Forbidden",
	404: "Not Found",
	405: "Method Not Allowed",
	408: "Request Timeout",
	409: "Conflict",
	413: "Payload Too Large",
	414: "URI Too Long",
	416: "Range Not Satisfiable",
	421: "Misdirected Request",
	429: "Too Many Requests",
	444: "No Response",
	499: "Client Closed Request",
	500: "Internal Server Error",
	501: "Not Implemented",
	502: "Bad Gateway",
	503: "Service Unavailable",
	504: "Gateway Timeout",
};

const classOf = (code: number) => CLASSES.find((c) => c.label === `${Math.floor(code / 100)}xx`);

const pct = (part: number, whole: number) => (whole ? (part / whole) * 100 : 0);

// Change against the previous period. `upIsBad` flips the colours for things like error counts.
const Delta = ({ now, before, upIsBad }: { now: number; before?: number; upIsBad?: boolean }) => {
	if (!before) {
		return <span className="text-secondary small">&nbsp;</span>;
	}
	const change = ((now - before) / before) * 100;
	if (Math.abs(change) < 0.05) {
		return <span className="text-secondary small">0%</span>;
	}
	const bad = upIsBad ? change > 0 : change < 0;
	return (
		<span className={`small ${bad ? "text-red" : "text-green"}`}>
			{change > 0 ? "\u2191" : "\u2193"} {Math.abs(change).toFixed(1)}%
		</span>
	);
};

interface Point extends TrafficCounts {
	ts: number;
}

interface BarsProps {
	points: number[]; // slot start times
	byTs: Map<number, Point>;
	value: (p: Point) => number;
	color: string;
	height: number;
	label?: (ts: number) => string;
	axis?: { from: number; to: number; hours: number };
}

// Bars along a time axis, one per slot
const Bars = ({ points, byTs, value, color, height, label, axis }: BarsProps) => {
	const width = 900;
	const max = Math.max(1, ...points.map((ts) => (byTs.has(ts) ? value(byTs.get(ts) as Point) : 0)));
	const barW = width / points.length;
	const pad = axis ? 22 : 0;
	return (
		<svg
			viewBox={`0 0 ${width} ${height + pad}`}
			className="w-100 d-block"
			preserveAspectRatio="none"
			style={{ height: height + pad }}
			role="img"
			aria-label="Requests over time"
		>
			<title>Requests over time</title>
			{axis &&
				[0, 0.5, 1].map((f) => (
					<line
						key={f}
						x1="0"
						x2={width}
						y1={height - f * (height - 4)}
						y2={height - f * (height - 4)}
						stroke="currentColor"
						opacity={f === 0 ? 0.3 : 0.1}
					/>
				))}
			{points.map((ts, i) => {
				const p = byTs.get(ts);
				const v = p ? value(p) : 0;
				const h = (v / max) * (height - 4);
				return (
					<g key={ts}>
						{label && <title>{`${label(ts)}: ${v.toLocaleString()}`}</title>}
						{h > 0 && (
							<rect
								x={i * barW + barW * 0.15}
								y={height - h}
								width={Math.max(1, barW * 0.7)}
								height={h}
								rx={Math.min(2, barW * 0.35)}
								fill={color}
							/>
						)}
					</g>
				);
			})}
			{axis && (
				<>
					<text x="0" y={height + 16} fontSize="11" fill="currentColor" opacity="0.6">
						{formatTime(axis.from, axis.hours)}
					</text>
					<text
						x={width / 2}
						y={height + 16}
						fontSize="11"
						fill="currentColor"
						opacity="0.6"
						textAnchor="middle"
					>
						{formatTime((axis.from + axis.to) / 2, axis.hours)}
					</text>
					<text x={width} y={height + 16} fontSize="11" fill="currentColor" opacity="0.6" textAnchor="end">
						{formatTime(axis.to, axis.hours)}
					</text>
					<text x="4" y="12" fontSize="11" fill="currentColor" opacity="0.6">
						{max.toLocaleString()}
					</text>
				</>
			)}
		</svg>
	);
};

const Tile = ({
	title,
	value,
	sub,
	delta,
}: {
	title: ReactNode;
	value: ReactNode;
	sub?: ReactNode;
	delta: ReactNode;
}) => (
	<div className="col-6 col-lg-3">
		<div className="card card-sm h-100">
			<div className="card-body">
				<div
					className="text-uppercase text-secondary fw-bold"
					style={{ fontSize: 11, letterSpacing: "0.05em" }}
				>
					{title}
				</div>
				<div className="h1 mb-1 mt-1">{value}</div>
				<div className="d-flex gap-2 align-items-baseline">
					{delta}
					{sub && <span className="text-secondary small">{sub}</span>}
				</div>
			</div>
		</div>
	</div>
);

interface ListRow {
	label: string;
	value: number;
	icon?: ReactNode;
}

const ListCard = ({ title, rows, empty }: { title: ReactNode; rows: ListRow[]; empty?: ReactNode }) => {
	const max = Math.max(1, ...rows.map((r) => r.value));
	return (
		<div className="col-md-6 col-xl-4">
			<div className="card h-100">
				<div className="card-body">
					<h4 className="card-title mb-3">{title}</h4>
					{rows.length === 0 && <div className="text-secondary">{empty ?? <T id="traffic.no-data" />}</div>}
					{rows.map((r) => (
						<div key={r.label} className="mb-2">
							<div className="d-flex justify-content-between small">
								<span className="text-truncate me-2 d-flex align-items-center gap-2" title={r.label}>
									{r.icon && (
										<span className="d-inline-flex" style={{ width: 20, flex: "none" }}>
											{r.icon}
										</span>
									)}
									<span className="text-truncate">{r.label}</span>
								</span>
								<span className="text-secondary">{r.value.toLocaleString()}</span>
							</div>
							<div className="progress progress-sm">
								<div
									className="progress-bar"
									style={{ width: `${(r.value / max) * 100}%`, background: BAR }}
								/>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
};

interface PanelProps {
	data: TrafficReport;
	// Set when the report is for a single host: the hosts table is left out
	single?: boolean;
}

const TrafficPanel = ({ data, single }: PanelProps) => {
	if (!data.enabled || !data.range || !data.totals) {
		return null;
	}
	const { totals, range, previous } = data;
	const prev = previous?.totals;
	const first = range.from - (range.from % range.step);
	const slots = Math.max(1, Math.ceil((range.to - first) / range.step));
	const points = Array.from({ length: slots + 1 }, (_, i) => first + i * range.step);
	const byTs = new Map((data.series ?? []).map((p) => [p.ts, p]));
	// The per-code points are hourly, so their charts use their own time slots
	const statusStep = data.statusStep ?? range.step;
	const statusFirst = range.from - (range.from % statusStep);
	const statusSlots = Math.max(1, Math.ceil((range.to - statusFirst) / statusStep));
	const statusPoints = Array.from({ length: statusSlots + 1 }, (_, i) => statusFirst + i * statusStep);
	const label = (ts: number) => formatTime(ts, range.hours);
	// Shares are of the counted codes, since codes are only counted from when the setting was switched on
	const statusTotal = (data.statuses ?? []).reduce((sum, st) => sum + st.total, 0);
	const prevHosts = new Map((previous?.hosts ?? []).map((h) => [`${h.hostType}|${h.hostId}`, h]));

	return (
		<>
			{data.error && <div className="alert alert-warning">{data.error}</div>}

			<div className="row row-cards mb-3">
				<Tile
					title={<T id="traffic.requests" />}
					value={totals.requests.toLocaleString()}
					delta={<Delta now={totals.requests} before={prev?.requests} />}
					sub={<T id="traffic.vs-previous" />}
				/>
				<Tile
					title={<T id="traffic.bandwidth" />}
					value={formatBytes(totals.bytes)}
					delta={<Delta now={totals.bytes} before={prev?.bytes} />}
					sub={<T id="traffic.vs-previous" />}
				/>
				<Tile
					title={<T id="traffic.server-errors" />}
					value={`${pct(totals.s5xx, totals.requests).toFixed(1)}%`}
					delta={<Delta now={totals.s5xx} before={prev?.s5xx} upIsBad />}
					sub={`${totals.s5xx.toLocaleString()} 5xx`}
				/>
				<Tile
					title={<T id="traffic.client-errors" />}
					value={`${pct(totals.s4xx, totals.requests).toFixed(1)}%`}
					delta={<Delta now={totals.s4xx} before={prev?.s4xx} upIsBad />}
					sub={`${totals.s4xx.toLocaleString()} 4xx`}
				/>
			</div>

			<div className="card mb-3">
				<div className="card-body">
					<h4 className="card-title">
						<T id="traffic.requests-per" data={{ step: stepLabel(range.step) }} />
					</h4>
					<Bars
						points={points}
						byTs={byTs}
						value={(p) => p.requests}
						color={BAR}
						height={160}
						label={label}
						axis={{ from: range.from, to: range.to, hours: range.hours }}
					/>
				</div>
			</div>

			<div className="card mb-3">
				<div className="card-body">
					<h4 className="card-title mb-1">
						<T id="traffic.status-codes" />
					</h4>
					<div className="text-secondary small mb-3">
						<T id="traffic.status-codes.hint" />
					</div>
					<div
						className="d-flex rounded overflow-hidden mb-3"
						style={{ height: 10, background: "var(--tblr-bg-surface-secondary)" }}
					>
						{CLASSES.map((c) => (
							<div
								key={c.key}
								style={{ width: `${pct(totals[c.key], totals.requests)}%`, background: c.color }}
							/>
						))}
					</div>
					<div className="row g-3">
						{CLASSES.map((c) => (
							<div key={c.key} className="col-6 col-lg-3 d-flex align-items-start gap-2">
								<span
									className="rounded-circle mt-1"
									style={{ width: 10, height: 10, background: c.color, flex: "none" }}
								/>
								<div>
									<div className="small">
										{c.label} · <T id={c.id} />
									</div>
									<div className="text-secondary small">
										{totals[c.key].toLocaleString()} ·{" "}
										{pct(totals[c.key], totals.requests).toFixed(1)}%
									</div>
								</div>
							</div>
						))}
					</div>
				</div>
			</div>

			<h4 className="mb-2 mt-4">
				<T id="traffic.class-over-time" />
			</h4>
			<div className="row row-cards mb-3">
				{CLASSES.map((c) => (
					<div key={c.key} className="col-6 col-lg-3">
						<div className="card card-sm h-100">
							<div className="card-body">
								<div className="d-flex justify-content-between align-items-baseline">
									<div className="h2 mb-0" style={{ color: c.color }}>
										{totals[c.key].toLocaleString()}
									</div>
									<span className="text-secondary small">
										{pct(totals[c.key], totals.requests).toFixed(1)}%
									</span>
								</div>
								<div className="text-secondary small mb-2">
									{c.label} · <T id={c.id} />
								</div>
								<Bars
									points={points}
									byTs={byTs}
									value={(p) => p[c.key]}
									color={c.color}
									height={44}
									label={label}
								/>
							</div>
						</div>
					</div>
				))}
			</div>

			{data.statusCodes && (data.statuses?.length ?? 0) > 0 && (
				<>
					<h4 className="mb-1 mt-4">
						<T id="traffic.by-status" />
					</h4>
					<div className="text-secondary small mb-2">
						<T id="traffic.by-status.hint" />
					</div>
					<div className="row row-cards mb-3">
						{(data.statuses ?? []).slice(0, 12).map((st) => {
							const color = classOf(st.code)?.color ?? "var(--tblr-secondary)";
							const slots = new Map<number, Point>(
								st.series.map((p) => [
									p.ts,
									{ ts: p.ts, requests: p.requests, s2xx: 0, s3xx: 0, s4xx: 0, s5xx: 0, bytes: 0 },
								]),
							);
							return (
								<div key={st.code} className="col-6 col-lg-3">
									<div className="card card-sm h-100">
										<div className="card-body">
											<div className="d-flex justify-content-between align-items-baseline">
												<div className="h2 mb-0" style={{ color }}>
													{st.code}
												</div>
												<span className="text-secondary small">
													{pct(st.total, statusTotal).toFixed(1)}%
												</span>
											</div>
											<div className="text-secondary small mb-2">
												{REASONS[st.code] ?? ""} · {st.total.toLocaleString()}
											</div>
											<Bars
												points={statusPoints}
												byTs={slots}
												value={(p) => p.requests}
												color={color}
												height={44}
												label={label}
											/>
										</div>
									</div>
								</div>
							);
						})}
					</div>
				</>
			)}

			{!single && (
				<div className="card mb-3">
					<div className="card-body">
						<h4 className="card-title mb-3">
							<T id="traffic.hosts" />
						</h4>
						<div className="table-responsive">
							<table className="table table-vcenter card-table">
								<thead>
									<tr>
										<th>
											<T id="traffic.host" />
										</th>
										<th className="text-end">
											<T id="traffic.requests" />
										</th>
										<th className="text-end">
											<T id="traffic.bandwidth" />
										</th>
										<th className="text-end">5xx</th>
										<th className="text-end">4xx</th>
									</tr>
								</thead>
								<tbody>
									{(data.hosts ?? []).map((h) => {
										const before = prevHosts.get(`${h.hostType}|${h.hostId}`);
										return (
											<tr key={`${h.hostType}|${h.hostId}`}>
												<td className="text-truncate" style={{ maxWidth: 260 }} title={h.label}>
													{h.label}
												</td>
												<td className="text-end">
													<div>{h.requests.toLocaleString()}</div>
													<Delta now={h.requests} before={before?.requests} />
												</td>
												<td className="text-end">
													<div>{formatBytes(h.bytes)}</div>
													<Delta now={h.bytes} before={before?.bytes} />
												</td>
												<td className="text-end">
													<div>{h.s5xx.toLocaleString()}</div>
													<Delta now={h.s5xx} before={before?.s5xx} upIsBad />
												</td>
												<td className="text-end">
													<div>{h.s4xx.toLocaleString()}</div>
													<Delta now={h.s4xx} before={before?.s4xx} upIsBad />
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			)}

			<div className="row row-cards">
				<ListCard
					title={<T id="traffic.top-paths" />}
					rows={(data.top?.path ?? []).map((r) => ({ label: r.item, value: r.hits }))}
				/>
				<ListCard
					title={<T id="traffic.top-ips" />}
					rows={(data.top?.ip ?? []).map((r) => ({
						label: r.item,
						value: r.hits,
						icon: <CountryMark code={r.country} />,
					}))}
				/>
				<ListCard
					title={<T id="traffic.top-countries" />}
					empty={data.geoip ? undefined : <T id="traffic.geoip-off" />}
					rows={(data.top?.country ?? []).map((r) => ({
						label: countryName(r.item),
						value: r.hits,
						icon: <CountryMark code={r.item} />,
					}))}
				/>
			</div>
			{data.geoip && (
				<div className="text-secondary small mt-3">
					<a href="https://db-ip.com" target="_blank" rel="noreferrer">
						IP Geolocation by DB-IP
					</a>
				</div>
			)}
		</>
	);
};

export { TrafficPanel };
