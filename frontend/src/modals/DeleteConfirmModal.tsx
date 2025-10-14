import { useQueryClient } from "@tanstack/react-query";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { Button } from "src/components";
import { T } from "src/locale";

interface ShowProps {
	title: string;
	children: ReactNode;
	onConfirm: () => Promise<void> | void;
	invalidations?: any[];
}

interface Props extends InnerModalProps, ShowProps {}

const showDeleteConfirmModal = (props: ShowProps) => {
	EasyModal.show(DeleteConfirmModal, props);
};

const DeleteConfirmModal = EasyModal.create(({ title, children, onConfirm, invalidations, visible, remove }: Props) => {
	const queryClient = useQueryClient();
	const [error, setError] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async () => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setError(null);
		try {
			await onConfirm();
			remove();
			// invalidate caches as requested
			invalidations?.forEach((inv) => {
				queryClient.invalidateQueries({ queryKey: inv });
			});
		} catch (err: any) {
			setError(<T id={err.message} />);
		}
		setIsSubmitting(false);
	};

	return (
		<Modal show={visible} onHide={remove}>
			<Modal.Header closeButton>
				<Modal.Title>
					<T id={title} />
				</Modal.Title>
			</Modal.Header>
			<Modal.Body>
				<Alert variant="danger" show={!!error} onClose={() => setError(null)} dismissible>
					{error}
				</Alert>
				{children}
			</Modal.Body>
			<Modal.Footer>
				<Button data-bs-dismiss="modal" onClick={remove} disabled={isSubmitting}>
					<T id="cancel" />
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
					<T id="action.delete" />
				</Button>
			</Modal.Footer>
		</Modal>
	);
});

export { showDeleteConfirmModal };
