import cn from "classnames";
import { useEffect, useRef } from "react";
import { T } from "src/locale";
import styles from "./LogViewer.module.css";

const LEVEL_PATTERN = /\b(ERROR|FATAL|WARN|SUCCESS|COMPLETE|DEBUG|INFO)\b/;

const levelClassName = (line: string): string | undefined => {
	const match = line.match(LEVEL_PATTERN);
	if (!match) {
		return undefined;
	}
	switch (match[1]) {
		case "ERROR":
		case "FATAL":
			return "text-danger";
		case "WARN":
			return "text-warning";
		case "SUCCESS":
		case "COMPLETE":
			return "text-success";
		case "DEBUG":
			return "text-secondary";
		default:
			return undefined;
	}
};

// How close to the bottom (in pixels) the user has to be for auto-scroll to keep
// following new lines. Scrolling further up than this to read history disables it,
// so newly polled lines never yank the viewport away from what's being read.
const AUTO_SCROLL_THRESHOLD_PX = 40;

interface Props {
	lines: string[];
}

export default function LogLines({ lines }: Props) {
	const containerRef = useRef<HTMLPreElement>(null);
	const stickToBottomRef = useRef(true);

	const handleScroll = () => {
		const el = containerRef.current;
		if (!el) {
			return;
		}
		const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
		stickToBottomRef.current = distanceFromBottom < AUTO_SCROLL_THRESHOLD_PX;
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: lines is a re-scroll trigger, not read in the body
	useEffect(() => {
		const el = containerRef.current;
		if (el && stickToBottomRef.current) {
			el.scrollTop = el.scrollHeight;
		}
	}, [lines]);

	if (!lines.length) {
		return (
			<div className={cn(styles.logBox, "text-secondary")}>
				<T id="logs.empty" />
			</div>
		);
	}

	return (
		<pre ref={containerRef} onScroll={handleScroll} className={styles.logBox}>
			{lines.map((line, idx) => (
				<span key={idx} className={cn(styles.logLine, levelClassName(line))}>
					{line}
				</span>
			))}
		</pre>
	);
}
