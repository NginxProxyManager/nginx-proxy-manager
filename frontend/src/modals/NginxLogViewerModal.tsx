import { IconChevronDown, IconChevronUp, IconPlayerPause, IconRefresh, IconSearch, IconX } from "@tabler/icons-react";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Modal from "react-bootstrap/Modal";
import { getNginxHostLog, type NginxLogHostType, type NginxLogKind, type NginxLogSnapshot } from "src/api/backend";
import AuthStore from "src/modules/AuthStore";

const MAX_LINES = 10_000;
const MAX_BUFFER_BYTES = 2 * 1024 * 1024;

type FollowEvent = "append" | "reset" | "ready" | "error" | "close";

interface Props extends InnerModalProps {
	hostType: NginxLogHostType;
	hostId: number;
	label: string;
}

interface RawFollowPayload {
	content?: string;
	next_cursor?: string;
	cursor?: string;
	reset_reason?: string;
	file?: { exists?: boolean; generation?: string | null };
	message?: string;
	reason?: string;
}

const splitLines = (content: string) => {
	const lines = content.replace(/\r\n/g, "\n").split("\n");
	if (lines[lines.length - 1] === "") lines.pop();
	return lines;
};

const boundedLines = (lines: string[]) => {
	let start = Math.max(0, lines.length - MAX_LINES);
	let byteSize = 0;
	for (let index = lines.length - 1; index >= start; index -= 1) {
		byteSize += new TextEncoder().encode(`${lines[index]}\n`).byteLength;
		if (byteSize > MAX_BUFFER_BYTES) {
			start = index + 1;
			break;
		}
	}
	return lines.slice(start);
};

const parseSseFrame = (frame: string) => {
	const fields: Record<string, string> = {};
	for (const line of frame.replace(/\r/g, "").split("\n")) {
		if (!line || line.startsWith(":")) continue;
		const separator = line.indexOf(":");
		if (separator < 0) continue;
		const key = line.slice(0, separator);
		const value = line.slice(separator + 1).trimStart();
		fields[key] = fields[key] ? `${fields[key]}\n${value}` : value;
	}
	if (!fields.event) return null;
	try {
		return {
			event: fields.event as FollowEvent,
			id: fields.id,
			data: JSON.parse(fields.data || "{}") as RawFollowPayload,
		};
	} catch {
		return null;
	}
};

const showNginxLogViewerModal = (hostType: NginxLogHostType, hostId: number, label: string) => {
	EasyModal.show(NginxLogViewerModal, { hostType, hostId, label });
};

const NginxLogViewerModal = EasyModal.create(({ hostType, hostId, label, visible, remove }: Props) => {
	const [logKind, setLogKind] = useState<NginxLogKind>("access");
	const [lines, setLines] = useState<string[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isFollowing, setIsFollowing] = useState(false);
	const [status, setStatus] = useState("");
	const [query, setQuery] = useState("");
	const [caseSensitive, setCaseSensitive] = useState(false);
	const [searchDirection, setSearchDirection] = useState<1 | -1>(1);
	const [matchIndex, setMatchIndex] = useState(0);
	const [loadNonce, setLoadNonce] = useState(0);
	const cursorRef = useRef("");
	const searchInputRef = useRef<HTMLInputElement>(null);
	const logContainerRef = useRef<HTMLDivElement>(null);
	const shouldAutoFollowRef = useRef(true);

	const replaceLines = useCallback((content: string) => setLines(boundedLines(splitLines(content))), []);
	const appendLines = useCallback((content: string) => {
		if (!content) return;
		setLines((current) => boundedLines([...current, ...splitLines(content)]));
		if (shouldAutoFollowRef.current) {
			window.requestAnimationFrame(() => {
				const container = logContainerRef.current;
				if (container) container.scrollTop = container.scrollHeight;
			});
		}
	}, []);

	useEffect(() => {
		if (!visible) return;
		let cancelled = false;
		let abortController: AbortController | null = null;
		let reconnectTimer: number | null = null;
		let restartWithSnapshot = false;
		const closeFollow = () => {
			abortController?.abort();
			if (reconnectTimer) window.clearTimeout(reconnectTimer);
		};
		const scheduleReconnect = () => {
			if (cancelled || !cursorRef.current) return;
			reconnectTimer = window.setTimeout(() => void connect(), 1_000);
		};
		const handleEvent = (event: FollowEvent, payload: RawFollowPayload) => {
			const nextCursor = payload.next_cursor || payload.cursor;
			if (nextCursor) cursorRef.current = nextCursor;
			if (event === "reset") {
				replaceLines(payload.content || "");
				setStatus(
					payload.reset_reason === "truncated"
						? "The log was truncated; showing a fresh tail."
						: "The log rotated; showing a fresh tail.",
				);
			} else if (event === "append") {
				appendLines(payload.content || "");
			} else if (event === "ready") {
				setIsFollowing(true);
			} else if (event === "error" || event === "close") {
				restartWithSnapshot = true;
				setIsFollowing(false);
				setStatus(payload.message || payload.reason || "Live log stream closed.");
			}
		};
		const connect = async () => {
			if (cancelled || !cursorRef.current) return;
			abortController = new AbortController();
			try {
				const token = AuthStore.token?.token;
				const response = await fetch(
					`/api/nginx/${hostType}/${hostId}/logs/${logKind}/follow?cursor=${encodeURIComponent(cursorRef.current)}`,
					{
						headers: token ? { Authorization: `Bearer ${token}` } : {},
						signal: abortController.signal,
					},
				);
				if (!response.ok || !response.body) throw new Error(`Live log request failed (${response.status})`);
				const reader = response.body.getReader();
				const decoder = new TextDecoder();
				let buffer = "";
				while (!cancelled) {
					const { done, value } = await reader.read();
					if (done) break;
					buffer += decoder.decode(value, { stream: true });
					let separator = buffer.indexOf("\n\n");
					while (separator !== -1) {
						const parsed = parseSseFrame(buffer.slice(0, separator));
						buffer = buffer.slice(separator + 2);
						if (parsed) handleEvent(parsed.event, parsed.data);
						separator = buffer.indexOf("\n\n");
					}
				}
				if (!cancelled) {
					if (restartWithSnapshot) setLoadNonce((value) => value + 1);
					else scheduleReconnect();
				}
			} catch (error) {
				if (!cancelled && (error as Error).name !== "AbortError") {
					setIsFollowing(false);
					setStatus((error as Error).message || "Unable to connect to the live log stream.");
					if ((error as Error).message.includes("(400)")) setLoadNonce((value) => value + 1);
					else scheduleReconnect();
				}
			}
		};
		const load = async () => {
			setIsLoading(true);
			setIsFollowing(false);
			setStatus("");
			try {
				const result: NginxLogSnapshot = await getNginxHostLog(hostType, hostId, logKind);
				if (cancelled) return;
				replaceLines(result.content);
				cursorRef.current = result.nextCursor;
				if (!result.file.exists) setStatus("This log file does not exist yet. Waiting for Nginx to create it.");
				if (result.truncated) setStatus("Only the newest available log lines are shown.");
				else if (loadNonce) setStatus("Log reloaded.");
				void connect();
			} catch (error) {
				if (!cancelled) setStatus((error as Error).message || "Unable to load this log.");
			} finally {
				if (!cancelled) setIsLoading(false);
			}
		};
		void load();
		return () => {
			cancelled = true;
			closeFollow();
		};
	}, [appendLines, hostId, hostType, loadNonce, logKind, replaceLines, visible]);

	const matches = useMemo(() => {
		const needle = caseSensitive ? query : query.toLowerCase();
		if (!needle) return [];
		return lines.reduce<number[]>((result, line, index) => {
			if ((caseSensitive ? line : line.toLowerCase()).includes(needle)) result.push(index);
			return result;
		}, []);
	}, [caseSensitive, lines, query]);
	const matchSet = useMemo(() => new Set(matches), [matches]);
	const activeMatchLine = matches.length ? matches[matchIndex % matches.length] : -1;
	const moveMatch = useCallback(
		(direction: 1 | -1) => {
			if (!matches.length) return;
			setSearchDirection(direction);
			setMatchIndex((index) => (index + direction + matches.length) % matches.length);
		},
		[matches.length],
	);

	useEffect(() => {
		if (!matches.length) return;
		const lineIndex = matches[matchIndex % matches.length];
		document.getElementById(`nginx-log-line-${lineIndex}`)?.scrollIntoView({ block: "center" });
	}, [matchIndex, matches]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
			if (event.key === "/" || event.key === "?") {
				event.preventDefault();
				setSearchDirection(event.key === "/" ? 1 : -1);
				searchInputRef.current?.focus();
			} else if (event.key === "n" && matches.length) {
				event.preventDefault();
				moveMatch(searchDirection);
			} else if (event.key === "N" && matches.length) {
				event.preventDefault();
				moveMatch(searchDirection === 1 ? -1 : 1);
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [matches.length, moveMatch, searchDirection]);

	return (
		<Modal show={visible} onHide={remove} size="xl" scrollable>
			<Modal.Header closeButton>
				<Modal.Title>Logs: {label}</Modal.Title>
			</Modal.Header>
			<Modal.Body>
				<div className="d-flex flex-wrap gap-2 align-items-center mb-3">
					<div className="btn-group" role="group" aria-label="Nginx log type">
						<button
							type="button"
							className={`btn btn-sm ${logKind === "access" ? "btn-primary" : "btn-outline-primary"}`}
							onClick={() => setLogKind("access")}
						>
							Access log
						</button>
						<button
							type="button"
							className={`btn btn-sm ${logKind === "error" ? "btn-primary" : "btn-outline-primary"}`}
							onClick={() => setLogKind("error")}
						>
							Error log
						</button>
					</div>
					<div className="input-group input-group-sm" style={{ maxWidth: 380 }}>
						<span className="input-group-text">
							<IconSearch size={16} />
						</span>
						<input
							ref={searchInputRef}
							className="form-control"
							value={query}
							onChange={(event) => {
								setQuery(event.target.value);
								setMatchIndex(0);
							}}
							placeholder="Search logs"
							aria-label="Search logs"
						/>
						<button
							type="button"
							className={`btn ${caseSensitive ? "btn-primary" : "btn-outline-secondary"}`}
							title="Match case"
							aria-label="Match case"
							onClick={() => {
								setCaseSensitive((value) => !value);
								setMatchIndex(0);
							}}
						>
							Aa
						</button>
						<button
							type="button"
							className="btn btn-outline-secondary"
							disabled={!matches.length}
							title="Previous match"
							aria-label="Previous match"
							onClick={() => moveMatch(-1)}
						>
							<IconChevronUp size={16} />
						</button>
						<button
							type="button"
							className="btn btn-outline-secondary"
							disabled={!matches.length}
							title="Next match"
							aria-label="Next match"
							onClick={() => moveMatch(1)}
						>
							<IconChevronDown size={16} />
						</button>
						<button
							type="button"
							className="btn btn-outline-secondary"
							disabled={!query}
							title="Clear search"
							aria-label="Clear search"
							onClick={() => {
								setQuery("");
								setMatchIndex(0);
							}}
						>
							<IconX size={16} />
						</button>
					</div>
					{query ? (
						<span className="small text-secondary">
							{matches.length
								? `${(matchIndex % matches.length) + 1}/${matches.length} matches`
								: "No matches"}
						</span>
					) : null}
					<span className={`badge ${isFollowing ? "bg-success" : "bg-secondary"}`}>
						{isFollowing ? "Live" : "Paused"}
					</span>
					<button
						type="button"
						className="btn btn-sm btn-outline-secondary"
						onClick={() => setLoadNonce((value) => value + 1)}
						title="Reload log"
					>
						<IconRefresh size={16} />
					</button>
					<button
						type="button"
						className="btn btn-sm btn-outline-secondary"
						onClick={remove}
						title="Close log viewer"
					>
						<IconPlayerPause size={16} />
					</button>
				</div>
				{status ? <div className="alert alert-info py-2 small">{status}</div> : null}
				{isLoading ? <div className="text-secondary">Loading log…</div> : null}
				<div
					ref={logContainerRef}
					className="border rounded bg-dark text-light p-2 overflow-auto"
					onScroll={(event) => {
						const container = event.currentTarget;
						shouldAutoFollowRef.current =
							container.scrollHeight - container.scrollTop - container.clientHeight < 24;
					}}
					style={{
						height: "55vh",
						fontFamily: "var(--tblr-font-monospace, monospace)",
						fontSize: "0.8rem",
						whiteSpace: "pre",
					}}
					aria-live="polite"
				>
					{lines.length ? (
						lines.map((line, index) => (
							<div
								key={`${index}-${line.slice(0, 24)}`}
								id={`nginx-log-line-${index}`}
								className={
									index === activeMatchLine
										? "bg-warning text-dark"
										: matchSet.has(index)
											? "bg-warning-lt"
											: undefined
								}
							>
								{line || " "}
							</div>
						))
					) : (
						<span className="text-secondary">No log lines to display.</span>
					)}
				</div>
				<div className="small text-secondary mt-2">The viewer retains the latest 10,000 lines or 2 MiB.</div>
			</Modal.Body>
			<Modal.Footer>
				<button type="button" className="btn btn-secondary" onClick={remove}>
					Close
				</button>
			</Modal.Footer>
		</Modal>
	);
});

export { showNginxLogViewerModal };
