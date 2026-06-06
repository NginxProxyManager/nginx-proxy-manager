import { IconAlertTriangle } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Form, Formik, Field } from "formik";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { createCertificate, testHttpCertificate } from "src/api/backend";
import { Button, DomainNamesField } from "src/components";
import { T } from "src/locale";
import { showObjectSuccess } from "src/notifications";

const showHTTPCertificateModal = () => {
	EasyModal.show(HTTPCertificateModal);
};

const HTTPCertificateModal = EasyModal.create(({ visible, remove }: InnerModalProps) => {
	const queryClient = useQueryClient();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [domains, setDomains] = useState([] as string[]);
	const [isTesting, setIsTesting] = useState(false);
	const [testResults, setTestResults] = useState(null as Record<string, string> | null);

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

	const handleTest = async () => {
		setIsTesting(true);
		setErrorMsg(null);
		setTestResults(null);
		try {
			const result = await testHttpCertificate(domains);
			setTestResults(result);
		} catch (err: any) {
			setErrorMsg(<T id={err.message} />);
		}
		setIsTesting(false);
	};

	const parseTestResults = () => {
		const elms = [];
		for (const domain in testResults) {
			const status = testResults[domain];
			if (status === "ok") {
				elms.push(
					<p>
						<strong>{domain}:</strong> <T id="certificates.http.reachability-ok" />
					</p>,
				);
			} else {
				if (status === "no-host") {
					elms.push(
						<p>
							<strong>{domain}:</strong> <T id="certificates.http.reachability-not-resolved" />
						</p>,
					);
				} else if (status === "failed") {
					elms.push(
						<p>
							<strong>{domain}:</strong> <T id="certificates.http.reachability-failed-to-check" />
						</p>,
					);
				} else if (status === "404") {
					elms.push(
						<p>
							<strong>{domain}:</strong> <T id="certificates.http.reachability-404" />
						</p>,
					);
				} else if (status === "wrong-data") {
					elms.push(
						<p>
							<strong>{domain}:</strong> <T id="certificates.http.reachability-wrong-data" />
						</p>,
					);
				} else if (status.startsWith("other:")) {
					const code = status.substring(6);
					elms.push(
						<p>
							<strong>{domain}:</strong> <T id="certificates.http.reachability-other" data={{ code }} />
						</p>,
					);
				} else {
					// This should never happen
					elms.push(
						<p>
							<strong>{domain}:</strong> ?
						</p>,
					);
				}
			}
		}

		return <>{elms}</>;
	};

	return (
		<Modal show={visible} onHide={remove}>
			<Formik
				initialValues={
					{
						domainNames: [],
						provider: "letsencrypt",
						meta: {
							keyType: "ecdsa",
						},
					} as any
				}
				onSubmit={onSubmit}
			>
				{() => (
					<Form>
						<Modal.Header closeButton>
							<Modal.Title>
								<T id="object.add" tData={{ object: "lets-encrypt-via-http" }} />
							</Modal.Title>
						</Modal.Header>
						<Modal.Body className="p-0">
							<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible>
								{errorMsg}
							</Alert>
							<div className="card m-0 border-0">
								<div className="card-body">
									<p className="text-warning">
										<IconAlertTriangle size={16} className="me-1" />
										<T id="certificates.http.warning" />
									</p>
									<DomainNamesField
										onChange={(doms) => {
											setDomains(doms);
											setTestResults(null);
										}}
									/>
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
								</div>
								{testResults ? (
									<div className="card-footer">
										<h5>
											<T id="certificates.http.test-results" />
										</h5>
										{parseTestResults()}
									</div>
								) : null}
							</div>
						</Modal.Body>
						<Modal.Footer>
							<Button data-bs-dismiss="modal" onClick={remove} disabled={isSubmitting || isTesting}>
								<T id="cancel" />
							</Button>
							<div className="ms-auto">
								<Button
									type="button"
									actionType="secondary"
									className="me-3"
									data-bs-dismiss="modal"
									isLoading={isTesting}
									disabled={isSubmitting || domains.length === 0}
									onClick={handleTest}
								>
									<T id="test" />
								</Button>
								<Button
									type="submit"
									actionType="primary"
									className="bg-pink"
									data-bs-dismiss="modal"
									isLoading={isSubmitting}
									disabled={isSubmitting || isTesting}
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

export { showHTTPCertificateModal };
