import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { type ReactNode, useEffect, useState } from "react";
import { Alert, Spinner } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { testHttpCertificate } from "src/api/backend";
import { T } from "src/locale";

const showReachabilityModal = (domains: string[]) => {
	EasyModal.show(ReachabilityModal, { domains });
};

const ReachabilityModal = EasyModal.create(({ visible, remove, domains }: InnerModalProps & { domains: string[] }) => {
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [testResults, setTestResults] = useState<{ domain: string; status: string }[] | null>(null);

	useEffect(() => {
		const handleTest = async () => {
			setErrorMsg(null);
			setTestResults(null);
			try {
				const result = await testHttpCertificate(domains);
				setTestResults(result);
			} catch (err: any) {
				setErrorMsg(<T id={err.message} />);
			}
		};

		handleTest();
	}, [domains]);

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
			<Modal.Header closeButton>
				<Modal.Title>
					<T id="certificates.http.test-results" />
				</Modal.Title>
			</Modal.Header>
			<Modal.Body className="p-0">
				<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible>
					{errorMsg}
				</Alert>
				<div className="card m-0 border-0">
					{testResults ? (
						<div className="card-footer">{parseTestResults()}</div>
					) : (
						!errorMsg && (
							<div className="card-footer">
								<Spinner animation="border" role="status" />
							</div>
						)
					)}
				</div>
			</Modal.Body>
		</Modal>
	);
});

export { showReachabilityModal };
