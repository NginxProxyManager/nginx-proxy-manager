import { IconCheck, IconPencil, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { intl } from "src/locale";

interface Props {
	value: string;
	onSave: (value: string) => Promise<void>;
	maxLength?: number;
}

/**
 * A name that can be edited in place. Enter saves and Escape cancels, without
 * submitting the form it sits in.
 */
export function InlineRename({ value, onSave, maxLength = 100 }: Props) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(value);
	const [saving, setSaving] = useState(false);

	const cancel = () => {
		setDraft(value);
		setEditing(false);
	};

	const save = async () => {
		const name = draft.trim();
		if (!name || name === value) {
			cancel();
			return;
		}
		setSaving(true);
		try {
			await onSave(name);
			setEditing(false);
		} finally {
			setSaving(false);
		}
	};

	if (!editing) {
		return (
			<span className="d-inline-flex align-items-center gap-1">
				<span className="text-break">{value}</span>
				<button
					type="button"
					className="btn btn-ghost-secondary btn-icon btn-sm"
					title={intl.formatMessage({ id: "action.rename" })}
					aria-label={intl.formatMessage({ id: "action.rename" })}
					onClick={() => {
						setDraft(value);
						setEditing(true);
					}}
				>
					<IconPencil size={14} />
				</button>
			</span>
		);
	}

	return (
		<span className="d-inline-flex align-items-center gap-1">
			<input
				type="text"
				className="form-control form-control-sm"
				value={draft}
				maxLength={maxLength}
				disabled={saving}
				// biome-ignore lint/a11y/noAutofocus: focus follows the user's click on rename
				autoFocus
				onFocus={(e) => e.target.select()}
				onChange={(e) => setDraft(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						save();
					} else if (e.key === "Escape") {
						e.preventDefault();
						e.stopPropagation();
						cancel();
					}
				}}
			/>
			<button
				type="button"
				className="btn btn-ghost-success btn-icon btn-sm"
				aria-label={intl.formatMessage({ id: "save" })}
				disabled={saving}
				onClick={save}
			>
				<IconCheck size={14} />
			</button>
			<button
				type="button"
				className="btn btn-ghost-secondary btn-icon btn-sm"
				aria-label={intl.formatMessage({ id: "cancel" })}
				disabled={saving}
				onClick={cancel}
			>
				<IconX size={14} />
			</button>
		</span>
	);
}
