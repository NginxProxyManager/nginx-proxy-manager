import { useQueryClient } from "@tanstack/react-query";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { Button } from "src/components";
import { T } from "src/locale";

interface ShowProps {
	title?: ReactNode;
	tTitle?: string;
	children: ReactNode;
	onConfirm: () => Promise<void> | void;
	invalidations?: any[];
}

interface Props extends InnerModalProps, ShowProps {}

const showDeleteConfirmModal = (props: ShowProps) => {
	EasyModal.show(DeleteConfirmModal, props);
};

const DeleteConfirmModal = EasyModal.create(
	({ title, tTitle, children, onConfirm, invalidations, visible, remove }: Props) => {
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
					<Modal.Title>{tTitle ? <T id={tTitle} /> : title ? title : null}</Modal.Title>
				</Modal.Header>
				<Modal.Body>
					<Alert variant="danger" show={!!error} onClose={() => setError(null)} dismissible>
						{error}
					</Alert>
					<div className="text-center mb-3">
						<svg
							role="img"
							aria-label="warning icon"
							xmlns="http://www.w3.org/2000/svg"
							className="icon mb-2 text-danger icon-lg"
							width="24"
							height="24"
							viewBox="0 0 24 24"
							stroke-width="2"
							stroke="currentColor"
							fill="none"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path stroke="none" d="M0 0h24v24H0z" fill="none" />
							<path d="M12 9v2m0 4v.01" />
							<path d="M5 19h14a2 2 0 0 0 1.84 -2.75l-7.1 -12.25a2 2 0 0 0 -3.5 0l-7.1 12.25a2 2 0 0 0 1.75 2.75" />
						</svg>
					</div>
					<div className="text-center mb-3">{children}</div>
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
	},
);

export { showDeleteConfirmModal };
