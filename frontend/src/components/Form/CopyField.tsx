import { IconCheck, IconCopy } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { T } from "src/locale";
import { copyText } from "src/modules/Clipboard";

interface Props {
	value: string;
	id?: string;
}

/**
 * A read-only value with a copy button. If the browser won't copy, the value is
 * selected so it can be copied by hand.
 */
export function CopyField({ value, id }: Props) {
	const [copied, setCopied] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const copy = async () => {
		const ok = await copyText(value);
		setCopied(ok);
		if (!ok) {
			inputRef.current?.focus();
			inputRef.current?.select();
		}
	};

	useEffect(() => {
		if (!copied) {
			return;
		}
		const timer = window.setTimeout(() => setCopied(false), 2000);
		return () => window.clearTimeout(timer);
	}, [copied]);

	return (
		<div className="input-group">
			<input
				ref={inputRef}
				id={id}
				type="text"
				className="form-control font-monospace"
				value={value}
				readOnly
				onFocus={(e) => e.target.select()}
			/>
			<button type="button" className="btn" onClick={copy}>
				{copied ? <IconCheck size={16} className="text-success" /> : <IconCopy size={16} />}
				<span className="ms-1">
					<T id={copied ? "action.copied" : "action.copy"} />
				</span>
			</button>
		</div>
	);
}
