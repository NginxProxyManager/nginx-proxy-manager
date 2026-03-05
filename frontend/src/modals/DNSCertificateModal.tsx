import { useQueryClient } from "@tanstack/react-query";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Form, Formik, Field } from "formik";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import type { Certificate } from "src/api/backend";
import { createCertificate, updateCertificate } from "src/api/backend";
import { Button, DNSProviderFields, DomainNamesField } from "src/components";
import { T } from "src/locale";
import { showObjectSuccess } from "src/notifications";

export interface DNSCertificateModalProps {
	certificate?: Certificate;
}

interface Props extends InnerModalProps, DNSCertificateModalProps {}

const showDNSCertificateModal = (certificate?: Certificate) => {
	EasyModal.show(DNSCertificateModal, { certificate });
};

const getInitialValues = (certificate?: Certificate) => {
	if (certificate) {
		return {
			id: certificate.id,
			domainNames: certificate.domainNames ?? [],
			provider: "letsencrypt" as const,
			meta: {
				dnsChallenge: true,
				dnsProvider: certificate.meta?.dnsProvider ?? "",
				dnsProviderCredentials: (certificate.meta?.dnsProviderCredentials as string) ?? "",
				propagationSeconds: certificate.meta?.propagationSeconds ?? undefined,
				keyType: (certificate.meta?.keyType as string) ?? "ecdsa",
			},
		};
	}
	return {
		domainNames: [] as string[],
		provider: "letsencrypt" as const,
		meta: {
			dnsChallenge: true,
			keyType: "ecdsa",
		},
	};
};

const DNSCertificateModal = EasyModal.create(({ visible, remove, certificate }: Props) => {
		const queryClient = useQueryClient();
		const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
		const [isSubmitting, setIsSubmitting] = useState(false);
		const isEdit = Boolean(certificate?.id);

		const onSubmit = async (values: any, { setSubmitting }: any) => {
			if (isSubmitting) return;
			setIsSubmitting(true);
			setErrorMsg(null);

			try {
				if (isEdit && values.id) {
					await updateCertificate(values.id, {
						meta: {
							dnsProvider: values.meta?.dnsProvider,
							dnsProviderCredentials: values.meta?.dnsProviderCredentials,
							propagationSeconds: values.meta?.propagationSeconds,
						},
					});
				} else {
					await createCertificate(values);
				}
				showObjectSuccess("certificate", "saved");
				remove();
			} catch (err: any) {
				setErrorMsg(<T id={err.message} />);
			}
			queryClient.invalidateQueries({ queryKey: ["certificates"] });
			setIsSubmitting(false);
			setSubmitting(false);
		};

		return (
			<Modal show={visible} onHide={remove}>
				<Formik
					initialValues={getInitialValues(certificate) as any}
					onSubmit={onSubmit}
					enableReinitialize={isEdit}
				>
				{() => (
					<Form>
						<Modal.Header closeButton>
							<Modal.Title>
								<T id={isEdit ? "object.edit" : "object.add"} tData={{ object: "lets-encrypt-via-dns" }} />
							</Modal.Title>
						</Modal.Header>
						<Modal.Body className="p-0">
							<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible>
								{errorMsg}
							</Alert>
							<div className="card m-0 border-0">
								<div className="card-body">
									{!isEdit && (
										<>
											<DomainNamesField isWildcardPermitted dnsProviderWildcardSupported />
											<Field name="meta.keyType">
												{({ field }: any) => (
													<div className="mb-3">
														<label htmlFor="keyType" className="form-label">
															<T id="certificates.key-type" />
														</label>
														<select
															id="keyType"
															className="form-select"
															{...field}
														>
															<option value="rsa">
																<T id="certificates.key-type-rsa" />
															</option>
															<option value="ecdsa">
																<T id="certificates.key-type-ecdsa" />
															</option>
														</select>
														<small className="form-text text-muted">
															<T id="certificates.key-type-description" />
														</small>
													</div>
												)}
											</Field>
										</>
									)}
									<DNSProviderFields editMode={isEdit} />
								</div>
							</div>
						</Modal.Body>
						<Modal.Footer>
							<Button data-bs-dismiss="modal" onClick={remove} disabled={isSubmitting}>
								<T id="cancel" />
							</Button>
							<Button
								type="submit"
								actionType="primary"
								className="ms-auto bg-pink"
								data-bs-dismiss="modal"
								isLoading={isSubmitting}
								disabled={isSubmitting}
							>
								<T id="save" />
							</Button>
						</Modal.Footer>
					</Form>
				)}
			</Formik>
		</Modal>
	);
});

export { showDNSCertificateModal };
