import { useEffect, useMemo, useState } from "react";
import Alert from "react-bootstrap/Alert";
import type { LogChannel, LogHostType, LogSourceType } from "src/api/backend";
import { Loading } from "src/components";
import { useLogSources, useLogTail } from "src/hooks";
import { T, intl } from "src/locale";
import LogLines from "./LogLines";

const LINES_OPTIONS = [100, 200, 500, 1000];
const LEVEL_OPTIONS = ["INFO", "WARN", "ERROR", "DEBUG", "SUCCESS", "FATAL", "COMPLETE"];
const SEARCH_DEBOUNCE_MS = 300;

const HOST_TYPES: { type: LogHostType; labelId: string }[] = [
	{ type: "proxy", labelId: "proxy-hosts" },
	{ type: "redirection", labelId: "redirection-hosts" },
	{ type: "dead", labelId: "dead-hosts" },
	{ type: "stream", labelId: "streams" },
];

interface Selection {
	type: LogSourceType;
	hostType?: LogHostType;
	hostId?: number;
}

const encodeSelection = (selection: Selection): string => {
	if (selection.type === "host") {
		return `host:${selection.hostType}:${selection.hostId}`;
	}
	return selection.type;
};

const decodeSelection = (value: string): Selection => {
	if (value === "system" || value === "letsencrypt") {
		return { type: value };
	}
	const [, hostType, hostId] = value.split(":");
	return { type: "host", hostType: hostType as LogHostType, hostId: Number(hostId) };
};

const formatBytes = (bytes: number): string => {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	const units = ["KB", "MB", "GB"];
	let value = bytes / 1024;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex++;
	}
	return `${value.toFixed(1)} ${units[unitIndex]}`;
};

export default function LogViewer() {
	const sourcesQuery = useLogSources();

	const [selection, setSelection] = useState<Selection>({ type: "system" });
	const [channel, setChannel] = useState<LogChannel>("access");
	const [level, setLevel] = useState("");
	const [lines, setLines] = useState(LINES_OPTIONS[1]);
	const [live, setLive] = useState(true);
	const [searchInput, setSearchInput] = useState("");
	const [search, setSearch] = useState("");

	useEffect(() => {
		const handle = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
		return () => clearTimeout(handle);
	}, [searchInput]);

	const tailQuery = useLogTail({
		type: selection.type,
		hostType: selection.hostType,
		hostId: selection.hostId,
		channel: selection.type === "host" ? channel : undefined,
		lines,
		level: selection.type === "system" && level ? level : undefined,
		search: search || undefined,
		live,
	});

	const hostGroups = useMemo(() => {
		if (!sourcesQuery.data) {
			return [];
		}
		return HOST_TYPES.map(({ type, labelId }) => ({
			type,
			labelId,
			options: sourcesQuery.data.hosts[type] || [],
		})).filter((group) => group.options.length > 0);
	}, [sourcesQuery.data]);

	const handleDownload = () => {
		const content = (tailQuery.data?.lines || []).join("\n");
		const blob = new Blob([content], { type: "text/plain" });
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `${encodeSelection(selection).replace(/:/g, "-")}.log`;
		a.click();
		window.URL.revokeObjectURL(url);
	};

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-purple" />
			<div className="card-header">
				<div className="row w-full g-2 align-items-center">
					<div className="col-auto">
						<h2 className="mt-1 mb-0">
							<T id="logs" />
						</h2>
					</div>
					{typeof tailQuery.data?.size === "number" && (
						<div className="col-auto">
							<span className="text-secondary small">{formatBytes(tailQuery.data.size)}</span>
						</div>
					)}
					<div className="col-auto">
						<select
							className="form-select form-select-sm"
							value={encodeSelection(selection)}
							onChange={(e) => {
								setSelection(decodeSelection(e.target.value));
								setChannel("access");
							}}
						>
							<option value="system">{intl.formatMessage({ id: "logs.source.system" })}</option>
							<option value="letsencrypt">{intl.formatMessage({ id: "lets-encrypt" })}</option>
							{hostGroups.map((group) => (
								<optgroup key={group.type} label={intl.formatMessage({ id: group.labelId })}>
									{group.options.map((option) => (
										<option key={option.id} value={`host:${group.type}:${option.id}`}>
											{option.label}
										</option>
									))}
								</optgroup>
							))}
						</select>
					</div>
					{selection.type === "host" && (
						<div className="col-auto">
							<div className="btn-group" role="group">
								<button
									type="button"
									className={`btn btn-sm ${channel === "access" ? "btn-primary" : "btn-outline-primary"}`}
									onClick={() => setChannel("access")}
								>
									<T id="logs.channel.access" />
								</button>
								<button
									type="button"
									className={`btn btn-sm ${channel === "error" ? "btn-primary" : "btn-outline-primary"}`}
									onClick={() => setChannel("error")}
								>
									<T id="logs.channel.error" />
								</button>
							</div>
						</div>
					)}
					{selection.type === "system" && (
						<div className="col-auto">
							<select
								className="form-select form-select-sm"
								value={level}
								onChange={(e) => setLevel(e.target.value)}
							>
								<option value="">{intl.formatMessage({ id: "logs.level.all" })}</option>
								{LEVEL_OPTIONS.map((lvl) => (
									<option key={lvl} value={lvl}>
										{lvl}
									</option>
								))}
							</select>
						</div>
					)}
					<div className="col-auto">
						<input
							type="search"
							className="form-control form-control-sm"
							placeholder={intl.formatMessage({ id: "logs.search-placeholder" })}
							value={searchInput}
							onChange={(e) => setSearchInput(e.target.value)}
						/>
					</div>
					<div className="col-auto">
						<select
							className="form-select form-select-sm"
							value={lines}
							onChange={(e) => setLines(Number(e.target.value))}
						>
							{LINES_OPTIONS.map((n) => (
								<option key={n} value={n}>
									{n}
								</option>
							))}
						</select>
					</div>
					<div className="col-auto ms-auto d-flex gap-2">
						<button
							type="button"
							className={`btn btn-sm ${live ? "btn-success" : "btn-outline-secondary"}`}
							onClick={() => setLive((v) => !v)}
						>
							<T id={live ? "logs.live" : "logs.paused"} />
						</button>
						<button
							type="button"
							className="btn btn-sm btn-outline-secondary"
							onClick={() => tailQuery.refetch()}
						>
							<T id="logs.refresh" />
						</button>
						<button
							type="button"
							className="btn btn-sm btn-outline-secondary"
							disabled={!tailQuery.data?.lines.length}
							onClick={handleDownload}
						>
							<T id="logs.download" />
						</button>
					</div>
				</div>
			</div>

			{tailQuery.isError && (
				<div className="card-body">
					<Alert variant="danger">{tailQuery.error?.message || "Unknown error"}</Alert>
				</div>
			)}

			{tailQuery.data?.truncated && (
				<div className="card-body pb-0">
					<Alert variant="warning">
						<T id="logs.truncated-warning" />
					</Alert>
				</div>
			)}

			{sourcesQuery.isLoading || (tailQuery.isLoading && !tailQuery.data) ? (
				<div className="card-body">
					<Loading noLogo />
				</div>
			) : (
				<LogLines lines={tailQuery.data?.lines || []} />
			)}
		</div>
	);
}
