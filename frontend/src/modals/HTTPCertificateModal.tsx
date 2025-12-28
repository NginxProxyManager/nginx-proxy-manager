import cn from "classnames";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
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
	const [testResults, setTestResults] = useState<{ domain: string; status: string }[] | null>(null);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		try {
			await createCertificate(values);
			showObjectSuccess("certificate", "saved");
			remove();
		} catch (err: any) {
			if (err.payload?.debug?.stack) {
				setErrorMsg(
					<div className="w-100">
						<T id={err.message} />
						<pre>
							<code>{err.payload.debug.stack.join("\n")}</code>
						</pre>
					</div>,
				);
			} else {
				setErrorMsg(<T id={err.message} />);
			}
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

	const toggleClasses = "form-check-input";
	const toggleEnabled = cn(toggleClasses, "bg-cyan");

	const parseTestResults = () => {
		if (!testResults) return null;

		return (
			<>
				{testResults.map((testResult) => {
					const { domain, status } = testResult;
					let messageComponent: ReactNode = status;

					switch (status) {
						case "ok":
							messageComponent = <T id="certificates.http.reachability-ok" />;
							break;
						case "no-host":
							messageComponent = <T id="certificates.http.reachability-not-resolved" />;
							break;
						case "failed":
							messageComponent = <T id="certificates.http.reachability-failed-to-check" />;
							break;
						case "404":
							messageComponent = <T id="certificates.http.reachability-404" />;
							break;
						case "wrong-data":
							messageComponent = <T id="certificates.http.reachability-wrong-data" />;
							break;
						default: {
							const code = status.substring(6);
							messageComponent = <T id="certificates.http.reachability-other" data={{ code }} />;
							break;
						}
					}

					return (
						<p key={domain}>
							<strong>{domain}:</strong> {messageComponent}
						</p>
					);
				})}
			</>
		);
	};

	return (
		<Modal show={visible} onHide={remove}>
			<Formik
				initialValues={
					{
						domainNames: [],
						provider: "letsencrypt",
						meta: {
							reuseKey: false,
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
									<div className="row">
										<Field name="meta.reuseKey">
											{({ field }: any) => (
												<label className="form-check form-switch mt-1">
													<input
														{...field}
														className={field.value ? toggleEnabled : toggleClasses}
														type="checkbox"
														checked={field.value}
													/>
													<span className="form-check-label">
														<T id="domains.reuse-key" />
													</span>
												</label>
											)}
										</Field>
									</div>
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
