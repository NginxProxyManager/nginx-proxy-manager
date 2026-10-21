import { IconAlertTriangle } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Form, Formik } from "formik";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { uploadCertificate, validateCertificate } from "src/api/backend";
import {
	Button,
	CertificateFilesFields,
	type CertificateFilesValues,
	certificateFilesInitialValues,
	certificateFilesToFormData,
	DateFormatter,
	Loading,
} from "src/components";
import { useCertificate } from "src/hooks";
import { T } from "src/locale";
import { showObjectSuccess } from "src/notifications";

interface Props extends InnerModalProps {
	id: number;
}

interface ValidatedInfo {
	cn: string;
	expiresOn: string;
}

const showUpdateCertificateModal = (id: number) => {
	EasyModal.show(UpdateCertificateModal, { id });
};

const UpdateCertificateModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const queryClient = useQueryClient();
	const { data, isLoading, error } = useCertificate(id);
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [validated, setValidated] = useState<ValidatedInfo | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const domainNames = data?.domainNames ?? [];
	const cnMismatch =
		!!validated && !domainNames.some((domain) => domain.toLowerCase() === validated.cn.toLowerCase());

	// First submit validates the files, the second one uploads them to the existing certificate
	const onSubmit = async (values: CertificateFilesValues, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		try {
			const formData = certificateFilesToFormData(values);
			if (!validated) {
				const result = await validateCertificate(formData);
				setValidated({
					cn: `${result.certificate?.cn ?? ""}`,
					expiresOn: `${result.certificate?.dates?.to ?? ""}`,
				});
			} else {
				await uploadCertificate(id, formData);
				showObjectSuccess("certificate", "saved");
				queryClient.invalidateQueries({ queryKey: ["certificates"] });
				queryClient.invalidateQueries({ queryKey: ["certificate", id] });
				remove();
			}
		} catch (err: any) {
			setErrorMsg(<T id={err.message} />);
		}

		setIsSubmitting(false);
		setSubmitting(false);
	};

	return (
		<Modal show={visible} onHide={isSubmitting ? undefined : remove}>
			<Formik initialValues={certificateFilesInitialValues} onSubmit={onSubmit}>
				{() => (
					<Form>
						<Modal.Header closeButton={!isSubmitting}>
							<Modal.Title>
								<T id="certificate.update" />
							</Modal.Title>
						</Modal.Header>
						<Modal.Body className="p-0">
							<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible>
								{errorMsg}
							</Alert>
							{isLoading && <Loading noLogo />}
							{!isLoading && error && (
								<Alert variant="danger" className="m-3">
									{error?.message || "Unknown error"}
								</Alert>
							)}
							{data && (
								<div className="card m-0 border-0">
									<div className="card-body">
										<p>
											<T id="certificate.update.info" data={{ name: data.niceName }} />
										</p>
										<dl className="row mb-3">
											<dt className="col-5">
												<T id="certificate.update.current-expires" />
											</dt>
											<dd className="col-7">
												<DateFormatter value={data.expiresOn} highlightPast />
											</dd>
										</dl>
										<CertificateFilesFields onChange={() => setValidated(null)} />
										{validated && (
											<>
												<Alert variant="success">
													<T id="certificate.update.validated" />
												</Alert>
												<dl className="row mb-3">
													<dt className="col-5">
														<T id="certificate.update.new-cn" />
													</dt>
													<dd className="col-7">{validated.cn}</dd>
													<dt className="col-5">
														<T id="certificate.update.new-expires" />
													</dt>
													<dd className="col-7">
														<DateFormatter value={validated.expiresOn} highlightPast />
													</dd>
												</dl>
												{cnMismatch && (
													<Alert variant="warning">
														<IconAlertTriangle size={16} className="me-1" />
														<T
															id="certificate.update.cn-mismatch"
															data={{ cn: validated.cn, domains: domainNames.join(", ") }}
														/>
													</Alert>
												)}
											</>
										)}
									</div>
								</div>
							)}
						</Modal.Body>
						<Modal.Footer>
							<Button data-bs-dismiss="modal" onClick={remove} disabled={isSubmitting}>
								<T id="cancel" />
							</Button>
							<Button
								type="submit"
								actionType="primary"
								className="ms-auto bg-pink"
								isLoading={isSubmitting}
								disabled={isSubmitting || !data}
							>
								{validated ? <T id="action.update" /> : <T id="action.validate" />}
							</Button>
						</Modal.Footer>
					</Form>
				)}
			</Formik>
		</Modal>
	);
});

export { showUpdateCertificateModal };
