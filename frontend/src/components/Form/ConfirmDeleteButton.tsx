import { IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { intl, T } from "src/locale";

interface Props {
	onConfirm: () => Promise<void>;
}

/**
 * A delete button that asks for a second click, so it can be used inside a modal
 */
export function ConfirmDeleteButton({ onConfirm }: Props) {
	const [confirming, setConfirming] = useState(false);
	const [busy, setBusy] = useState(false);

	if (!confirming) {
		return (
			<button
				type="button"
				className="btn btn-ghost-danger btn-icon btn-sm"
				title={intl.formatMessage({ id: "action.delete" })}
				aria-label={intl.formatMessage({ id: "action.delete" })}
				onClick={() => setConfirming(true)}
			>
				<IconTrash size={16} />
			</button>
		);
	}

	return (
		<span className="d-inline-flex gap-1">
			<button
				type="button"
				className="btn btn-danger btn-sm"
				disabled={busy}
				onClick={async () => {
					setBusy(true);
					try {
						await onConfirm();
					} finally {
						setBusy(false);
						setConfirming(false);
					}
				}}
			>
				<T id="action.delete" />
			</button>
			<button type="button" className="btn btn-sm" disabled={busy} onClick={() => setConfirming(false)}>
				<T id="cancel" />
			</button>
		</span>
	);
}
