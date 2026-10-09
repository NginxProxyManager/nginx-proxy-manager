import { useQueryClient } from "@tanstack/react-query";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { type ReactNode, useEffect, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { renewCertificate } from "src/api/backend";
import { Button, Loading } from "src/components";
import { useCertificate } from "src/hooks";
import { T } from "src/locale";
import { showObjectSuccess } from "src/notifications";

interface Props extends InnerModalProps {
	id: number;
}

const showRenewCertificateModal = (id: number) => {
	EasyModal.show(RenewCertificateModal, { id });
};

const RenewCertificateModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const queryClient = useQueryClient();
	const { data, isLoading, error } = useCertificate(id);
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isFresh, setIsFresh] = useState(true);
	const [isSubmitting, setIsSubmitting] = useState(false);

	useEffect(() => {
		if (!data || !isFresh || isSubmitting) return;
		setIsFresh(false);
		setIsSubmitting(true);

		renewCertificate(id)
			.then(() => {
				showObjectSuccess("certificate", "renewed");
				queryClient.invalidateQueries({ queryKey: ["certificates"] });
				remove();
			})
			.catch((err: any) => {
				setErrorMsg(<T id={err.message} />);
			})
			.finally(() => {
				setIsSubmitting(false);
			});
	}, [id, data, isFresh, isSubmitting, remove, queryClient]);

	return (
		<Modal show={visible} onHide={isSubmitting ? undefined : remove}>
			<Modal.Header closeButton={!isSubmitting}>
				<Modal.Title>
					<T id="certificate.renew" />
				</Modal.Title>
			</Modal.Header>
			<Modal.Body>
				<Alert variant="danger" show={!!errorMsg}>
					{errorMsg}
				</Alert>
				{isLoading && <Loading noLogo />}
				{!isLoading && error && (
					<Alert variant="danger" className="m-3">
						{error?.message || "Unknown error"}
					</Alert>
				)}
				{data && isSubmitting && !errorMsg ? <p className="text-center mt-3">Please wait ...</p> : null}
			</Modal.Body>
			<Modal.Footer>
				<Button data-bs-dismiss="modal" onClick={remove} disabled={isSubmitting}>
					<T id="action.close" />
				</Button>
			</Modal.Footer>
		</Modal>
	);
});

export { showRenewCertificateModal };
