import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { Button } from "src/components";
import { intl } from "src/locale";

interface Props {
	title: string;
	children: ReactNode;
	onConfirm: () => Promise<void> | void;
	onClose: () => void;
	invalidations?: any[];
}
export function DeleteConfirmModal({ title, children, onConfirm, onClose, invalidations }: Props) {
	const queryClient = useQueryClient();
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async () => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setError(null);
		try {
			await onConfirm();
			onClose();
			// invalidate caches as requested
			invalidations?.forEach((inv) => {
				queryClient.invalidateQueries({ queryKey: inv });
			});
		} catch (err: any) {
			setError(intl.formatMessage({ id: err.message }));
		}
		setIsSubmitting(false);
	};

	return (
		<Modal show onHide={onClose} animation={false}>
			<Modal.Header closeButton>
				<Modal.Title>{title}</Modal.Title>
			</Modal.Header>
			<Modal.Body>
				<Alert variant="danger" show={!!error} onClose={() => setError(null)} dismissible>
					{error}
				</Alert>
				{children}
			</Modal.Body>
			<Modal.Footer>
				<Button data-bs-dismiss="modal" onClick={onClose} disabled={isSubmitting}>
					{intl.formatMessage({ id: "cancel" })}
				</Button>
				<Button
					type="submit"
					actionType="primary"
					className="ms-auto btn-red"
					data-bs-dismiss="modal"
					isLoading={isSubmitting}
					disabled={isSubmitting}
					onClick={onSubmit}
				>
					{intl.formatMessage({ id: "action.delete" })}
				</Button>
			</Modal.Footer>
		</Modal>
	);
}
