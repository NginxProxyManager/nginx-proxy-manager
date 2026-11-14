import { IconCheck, IconCopy } from "@tabler/icons-react";
import { type ReactNode, useEffect, useState } from "react";
import { T } from "src/locale";
import { copyText } from "src/modules/Clipboard";

const textOf = (node: ReactNode): string => {
	if (node === null || node === undefined || typeof node === "boolean") return "";
	if (typeof node === "string" || typeof node === "number") return String(node);
	if (Array.isArray(node)) return node.map(textOf).join("");
	if (typeof node === "object" && "props" in node) return textOf((node.props as { children?: ReactNode }).children);
	return "";
};

interface CopyButtonProps {
	text: string;
	className?: string;
	testId?: string;
}
export function CopyButton({ text, className, testId }: CopyButtonProps) {
	const [copied, setCopied] = useState(false);
	useEffect(() => {
		if (!copied) return;
		const timer = setTimeout(() => setCopied(false), 2000);
		return () => clearTimeout(timer);
	}, [copied]);
	return (
		<button
			type="button"
			className={className ?? "btn btn-sm"}
			onClick={() => copyText(text).then(setCopied)}
			data-testid={testId}
		>
			{copied ? <IconCheck size={14} className="me-1" /> : <IconCopy size={14} className="me-1" />}
			<T id={copied ? "action.copied" : "action.copy"} />
		</button>
	);
}

interface CodeBlockProps {
	children?: ReactNode;
	className?: string;
	testId?: string;
}
/**
 * A <pre> block with a copy button in the corner. Also used as the `pre`
 * renderer of markdown help pages, so every code block there can be copied.
 */
export function CopyableCode({ children, className, testId }: CodeBlockProps) {
	const text = textOf(children).replace(/\n$/, "");
	return (
		<div className="position-relative">
			<pre className={className ?? "small"} data-testid={testId}>
				{children}
			</pre>
			<CopyButton text={text} className="btn btn-sm position-absolute top-0 end-0 m-1" />
		</div>
	);
}
