import { IconAlertTriangle, IconInfoCircle } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Form, Formik } from "formik";
import { type ReactNode, useState, useEffect } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { createCertificate, getMkcertStatus, downloadMkcertCA } from "src/api/backend";
import type { MkcertStatus } from "src/api/backend";
import { Button, DomainNamesField } from "src/components";
import { T } from "src/locale";
import { showObjectSuccess } from "src/notifications";

const showMkcertCertificateModal = () => {
	EasyModal.show(MkcertCertificateModal);
};

const MkcertCertificateModal = EasyModal.create(({ visible, remove }: InnerModalProps) => {
	const queryClient = useQueryClient();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [mkcertStatus, setMkcertStatus] = useState<MkcertStatus | null>(null);
	const [isLoadingStatus, setIsLoadingStatus] = useState(true);

	useEffect(() => {
		const fetchStatus = async () => {
			try {
				const status = await getMkcertStatus();
				setMkcertStatus(status);
			} catch (err: any) {
				setErrorMsg(<T id={err.message} />);
			}
			setIsLoadingStatus(false);
		};
		fetchStatus();
	}, []);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		try {
			await createCertificate(values);
			showObjectSuccess("certificate", "saved");
			remove();
		} catch (err: any) {
			setErrorMsg(<T id={err.message} />);
		}
		queryClient.invalidateQueries({ queryKey: ["certificates"] });
		setIsSubmitting(false);
		setSubmitting(false);
	};

	const handleDownloadCA = async () => {
		try {
			await downloadMkcertCA();
		} catch (err: any) {
			setErrorMsg(<T id={err.message} />);
		}
	};

	const renderMkcertNotInstalled = () => (
		<Alert variant="danger">
			<IconAlertTriangle size={16} className="me-1" />
			<T id="certificates.mkcert.not-installed" />
		</Alert>
	);

	const renderMkcertStatus = () => {
		if (!mkcertStatus) return null;

		return (
			<div className="mb-3">
				<div className="d-flex align-items-center mb-2">
					<IconInfoCircle size={16} className="me-1 text-info" />
					<small className="text-muted">
						<T id="certificates.mkcert.version" />: {mkcertStatus.version || "N/A"}
					</small>
				</div>
				{mkcertStatus.caInstalled && (
					<Button
						type="button"
						actionType="secondary"
						size="sm"
						onClick={handleDownloadCA}
					>
						<T id="certificates.mkcert.download-ca" />
					</Button>
				)}
			</div>
		);
	};

	return (
		<Modal show={visible} onHide={remove}>
			<Formik
				initialValues={
					{
						domainNames: [],
						provider: "mkcert",
						meta: {},
					} as any
				}
				onSubmit={onSubmit}
			>
				{() => (
					<Form>
						<Modal.Header closeButton>
							<Modal.Title>
								<T id="certificates.mkcert.title" />
							</Modal.Title>
						</Modal.Header>
						<Modal.Body className="p-0">
							<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible>
								{errorMsg}
							</Alert>
							<div className="card m-0 border-0">
								<div className="card-body">
									{isLoadingStatus ? (
										<div className="text-center py-3">
											<div className="spinner-border spinner-border-sm" role="status">
												<span className="visually-hidden">Loading...</span>
											</div>
										</div>
									) : mkcertStatus?.installed ? (
										<>
											<Alert variant="warning" className="mb-3">
												<IconAlertTriangle size={16} className="me-1" />
												<T id="certificates.mkcert.warning" />
											</Alert>
											{renderMkcertStatus()}
											<DomainNamesField />
										</>
									) : (
										renderMkcertNotInstalled()
									)}
								</div>
							</div>
						</Modal.Body>
						<Modal.Footer>
							<Button data-bs-dismiss="modal" onClick={remove} disabled={isSubmitting}>
								<T id="cancel" />
							</Button>
							<div className="ms-auto">
								<Button
									type="submit"
									actionType="primary"
									className="bg-pink"
									data-bs-dismiss="modal"
									isLoading={isSubmitting}
									disabled={isSubmitting || !mkcertStatus?.installed}
								>
									<T id="save" />
								</Button>
							</div>
						</Modal.Footer>
					</Form>
				)}
			</Formik>
		</Modal>
	);
});

export { showMkcertCertificateModal };
