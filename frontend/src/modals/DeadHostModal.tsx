import { IconSettings } from "@tabler/icons-react";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Form } from "formik";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import type { HostMeta } from "src/api/backend";
import {
	Button,
	DomainNamesField,
	HostConfigTestResult,
	Loading,
	NginxConfigField,
	NginxErrorMessage,
	SaveWarning,
	SSLCertificateField,
	SSLOptionsFields,
	TestConfigButton,
} from "src/components";
import { FormModal } from "src/components/Form";
import { useDeadHost, useHostConfigTest, useSetDeadHost, useUser } from "src/hooks";
import { T } from "src/locale";
import { formatApiError, getNginxErrorDetails, hasSaveWarnings, stripServerMeta } from "src/modules/HostStatus";
import { showObjectSuccess } from "src/notifications";

const showDeadHostModal = (id: number | "new") => {
	EasyModal.show(DeadHostModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "new";
}
const DeadHostModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const { data: currentUser } = useUser("me");
	const { data, isLoading, error } = useDeadHost(id);
	const { mutate: setDeadHost } = useSetDeadHost();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	// Set when a save went through but nginx couldn't load the host
	const [savedMeta, setSavedMeta] = useState<HostMeta | null>(null);
	// Id of a host created by this modal, so that saving again updates it
	const [savedId, setSavedId] = useState<number | null>(null);
	const configTest = useHostConfigTest("dead-hosts");

	const isAdmin = currentUser?.roles?.includes("admin");

	// What a save sends, also what "Test" checks
	const buildPayload = (values: any) => {
		const payload = {
			id: savedId ?? (id === "new" ? undefined : id),
			...values,
			// server-owned status keys are never sent back
			meta: stripServerMeta(values.meta),
		};
		// Only admins may change the advanced config
		if (!isAdmin) {
			delete payload.advanced_config;
			delete payload.advancedConfig;
		}
		return payload;
	};

	const onSubmit = async (values: any, { setSubmitting, resetForm }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);
		setSavedMeta(null);
		configTest.reset();

		const payload = buildPayload(values);

		setDeadHost(payload, {
			onError: (err: unknown) => {
				const details = getNginxErrorDetails(err);
				setErrorMsg(
					details ? (
						<NginxErrorMessage message={formatApiError(err)} details={details} />
					) : (
						formatApiError(err)
					),
				);
			},
			onSuccess: (result: any) => {
				if (result && hasSaveWarnings(result.meta)) {
					// Keep the modal open so the problem can be seen
					setSavedId(result.id || null);
					// A requested certificate ("new") now exists: saving again must not request another one.
					// The saved values become the new baseline, so closing now doesn't ask about unsaved changes.
					resetForm({ values: { ...values, certificateId: result.certificateId || 0 } });
					setSavedMeta(result.meta);
					return;
				}
				showObjectSuccess("dead-host", "saved");
				remove();
			},
			onSettled: () => {
				setIsSubmitting(false);
				setSubmitting(false);
			},
		});
	};

	return (
		<>
			{(isLoading || (error && !data)) && (
				<Modal show={visible} onHide={remove}>
					{!isLoading && error && (
						<Alert variant="danger" className="m-3">
							{error?.message || "Unknown error"}
						</Alert>
					)}
					{isLoading && <Loading noLogo />}
				</Modal>
			)}
			{!isLoading && data && (
				<FormModal
					show={visible}
					onHide={remove}
					preventHide={isSubmitting}
					initialValues={
						{
							domainNames: data?.domainNames,
							certificateId: data?.certificateId,
							sslForced: data?.sslForced,
							advancedConfig: data?.advancedConfig,
							http2Support: data?.http2Support,
							hstsEnabled: data?.hstsEnabled,
							hstsSubdomains: data?.hstsSubdomains,
							meta: data?.meta || {},
						} as any
					}
					onSubmit={onSubmit}
				>
					{({ onHide, ...form }) => (
						<Form>
							<Modal.Header closeButton>
								<Modal.Title>
									<T
										id={data?.id || savedId ? "object.edit" : "object.add"}
										tData={{ object: "dead-host" }}
									/>
								</Modal.Title>
							</Modal.Header>
							<Modal.Body className="p-0">
								{savedMeta ? <SaveWarning meta={savedMeta} onClose={onHide} /> : null}
								<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible>
									{errorMsg}
								</Alert>
								<HostConfigTestResult
									result={configTest.result}
									error={configTest.error}
									testedKey={configTest.testedKey}
									onClose={configTest.reset}
								/>
								<div className="card m-0 border-0">
									<div className="card-header">
										<ul className="nav nav-tabs card-header-tabs" data-bs-toggle="tabs">
											<li className="nav-item" role="presentation">
												<a
													href="#tab-details"
													className="nav-link active"
													data-bs-toggle="tab"
													aria-selected="true"
													role="tab"
												>
													<T id="column.details" />
												</a>
											</li>
											<li className="nav-item" role="presentation">
												<a
													href="#tab-ssl"
													className="nav-link"
													data-bs-toggle="tab"
													aria-selected="false"
													tabIndex={-1}
													role="tab"
												>
													<T id="column.ssl" />
												</a>
											</li>
											{isAdmin && (
												<li className="nav-item ms-auto" role="presentation">
													<a
														href="#tab-advanced"
														className="nav-link"
														title="Settings"
														data-bs-toggle="tab"
														aria-selected="false"
														tabIndex={-1}
														role="tab"
													>
														<IconSettings size={20} />
													</a>
												</li>
											)}
										</ul>
									</div>
									<div className="card-body">
										<div className="tab-content">
											<div className="tab-pane active show" id="tab-details" role="tabpanel">
												<DomainNamesField isWildcardPermitted dnsProviderWildcardSupported />
											</div>
											<div className="tab-pane" id="tab-ssl" role="tabpanel">
												<SSLCertificateField
													name="certificateId"
													label="ssl-certificate"
													allowNew
												/>
												<SSLOptionsFields color="bg-red" />
											</div>
											{isAdmin && (
												<div className="tab-pane" id="tab-advanced" role="tabpanel">
													<NginxConfigField />
												</div>
											)}
										</div>
									</div>
								</div>
							</Modal.Body>
							<Modal.Footer>
								<Button data-bs-dismiss="modal" onClick={onHide} disabled={isSubmitting}>
									<T id="cancel" />
								</Button>
								<TestConfigButton
									onClick={() => {
										setErrorMsg(null);
										configTest.runTest(form, buildPayload(form.values));
									}}
									isTesting={configTest.isTesting}
									disabled={isSubmitting}
								/>
								<Button
									type="submit"
									actionType="primary"
									className="bg-red"
									data-bs-dismiss="modal"
									isLoading={isSubmitting}
									disabled={isSubmitting}
								>
									<T id="save" />
								</Button>
							</Modal.Footer>
						</Form>
					)}
				</FormModal>
			)}
		</>
	);
});

export { showDeadHostModal };
