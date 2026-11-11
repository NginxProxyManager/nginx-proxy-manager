import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form } from "formik";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import type { HostMeta } from "src/api/backend";
import {
	Button,
	HostConfigTestResult,
	Loading,
	NginxErrorMessage,
	SaveWarning,
	SSLCertificateField,
	SSLOptionsFields,
	TestConfigButton,
	UpstreamField,
	usePrefillGuard,
} from "src/components";
import { FormModal } from "src/components/Form";
import { useHostConfigTest, useSetStream, useStream } from "src/hooks";
import { intl, T } from "src/locale";
import { validateNumber, validateString } from "src/modules/Validations";
import { formatApiError, getNginxErrorDetails, hasSaveWarnings, stripServerMeta } from "src/modules/HostStatus";
import { showObjectSuccess } from "src/notifications";

const showStreamModal = (id: number | "new") => {
	EasyModal.show(StreamModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "new";
}
const StreamModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const { data, isLoading, error } = useStream(id);
	const { mutate: setStream } = useSetStream();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const guardPrefill = usePrefillGuard();
	// Set when a save went through but nginx couldn't load the host
	const [savedMeta, setSavedMeta] = useState<HostMeta | null>(null);
	// Id of a host created by this modal, so that saving again updates it
	const [savedId, setSavedId] = useState<number | null>(null);
	const configTest = useHostConfigTest("streams");

	// What a save sends, also what "Test" checks
	const buildPayload = (values: any) => ({
		id: savedId ?? (id === "new" ? undefined : id),
		...values,
		// server-owned status keys are never sent back
		meta: stripServerMeta(values.meta),
	});

	const onSubmit = async (values: any, { setSubmitting, resetForm }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);
		setSavedMeta(null);
		configTest.reset();

		const payload = buildPayload(values);

		setStream(payload, {
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
				showObjectSuccess("stream", "saved");
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
							incomingPort: data?.incomingPort,
							forwardingHost: data?.forwardingHost,
							forwardingPort: data?.forwardingPort,
							tcpForwarding: data?.tcpForwarding,
							udpForwarding: data?.udpForwarding,
							certificateId: data?.certificateId,
							meta: data?.meta || {},
						} as any
					}
					onSubmit={onSubmit}
				>
					{({ onHide, setFieldValue, ...form }: any) => (
						<Form>
							<Modal.Header closeButton>
								<Modal.Title>
									<T
										id={data?.id || savedId ? "object.edit" : "object.add"}
										tData={{ object: "stream" }}
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
										</ul>
									</div>
									<div className="card-body">
										<div className="tab-content">
											<div className="tab-pane active show" id="tab-details" role="tabpanel">
												<Field name="incomingPort" validate={validateNumber(1, 65535)}>
													{({ field, form }: any) => (
														<div className="mb-3">
															<label className="form-label" htmlFor="incomingPort">
																<T id="stream.incoming-port" />
															</label>
															<input
																id="incomingPort"
																type="number"
																min={1}
																max={65535}
																className={`form-control ${form.errors.incomingPort && form.touched.incomingPort ? "is-invalid" : ""}`}
																required
																placeholder="eg: 8080"
																{...field}
															/>
															{form.errors.incomingPort ? (
																<div className="invalid-feedback">
																	{form.errors.incomingPort &&
																	form.touched.incomingPort
																		? form.errors.incomingPort
																		: null}
																</div>
															) : null}
														</div>
													)}
												</Field>
												<div className="row">
													<div className="col-md-8">
														<Field name="forwardingHost" validate={validateString(1, 255)}>
															{({ field, form }: any) => (
																<div className="mb-3">
																	<label
																		className="form-label"
																		htmlFor="forwardingHost"
																	>
																		<T id="stream.forward-host" />
																	</label>
																	<UpstreamField
																		id="forwardingHost"
																		value={field.value || ""}
																		isInvalid={
																			!!(
																				form.errors.forwardingHost &&
																				form.touched.forwardingHost
																			)
																		}
																		placeholder={intl.formatMessage({
																			id: "stream.forward-host.placeholder",
																		})}
																		onChange={(v) =>
																			form.setFieldValue("forwardingHost", v)
																		}
																		onBlur={() =>
																			form.setFieldTouched("forwardingHost", true)
																		}
																		onSelectCandidate={(picked) => {
																			const prefill = guardPrefill(
																				picked,
																				{ port: form.values.forwardingPort },
																				{
																					port: form.initialValues
																						.forwardingPort,
																				},
																			);
																			if (prefill.port !== undefined) {
																				form.setFieldValue(
																					"forwardingPort",
																					prefill.port ?? "",
																				);
																			}
																		}}
																	/>
																	{form.errors.forwardingHost ? (
																		<div className="invalid-feedback">
																			{form.errors.forwardingHost &&
																			form.touched.forwardingHost
																				? form.errors.forwardingHost
																				: null}
																		</div>
																	) : null}
																</div>
															)}
														</Field>
													</div>
													<div className="col-md-4">
														<Field
															name="forwardingPort"
															validate={validateNumber(1, 65535)}
														>
															{({ field, form }: any) => (
																<div className="mb-3">
																	<label
																		className="form-label"
																		htmlFor="forwardingPort"
																	>
																		<T id="host.forward-port" />
																	</label>
																	<input
																		id="forwardingPort"
																		type="number"
																		min={1}
																		max={65535}
																		className={`form-control ${form.errors.forwardingPort && form.touched.forwardingPort ? "is-invalid" : ""}`}
																		required
																		placeholder="eg: 8081"
																		{...field}
																	/>
																	{form.errors.forwardingPort ? (
																		<div className="invalid-feedback">
																			{form.errors.forwardingPort &&
																			form.touched.forwardingPort
																				? form.errors.forwardingPort
																				: null}
																		</div>
																	) : null}
																</div>
															)}
														</Field>
													</div>
												</div>
												<div className="my-3">
													<h3 className="py-2">
														<T id="host.flags.protocols" />
													</h3>
													<div className="divide-y">
														<div>
															<label className="row" htmlFor="tcpForwarding">
																<span className="col">
																	<T id="streams.tcp" />
																</span>
																<span className="col-auto">
																	<Field name="tcpForwarding" type="checkbox">
																		{({ field }: any) => (
																			<label className="form-check form-check-single form-switch">
																				<input
																					id="tcpForwarding"
																					className="form-check-input"
																					type="checkbox"
																					name={field.name}
																					checked={field.value}
																					onChange={(e: any) => {
																						setFieldValue(
																							field.name,
																							e.target.checked,
																						);
																						if (!e.target.checked) {
																							setFieldValue(
																								"udpForwarding",
																								true,
																							);
																						}
																					}}
																				/>
																			</label>
																		)}
																	</Field>
																</span>
															</label>
														</div>
														<div>
															<label className="row" htmlFor="udpForwarding">
																<span className="col">
																	<T id="streams.udp" />
																</span>
																<span className="col-auto">
																	<Field name="udpForwarding" type="checkbox">
																		{({ field }: any) => (
																			<label className="form-check form-check-single form-switch">
																				<input
																					id="udpForwarding"
																					className="form-check-input"
																					type="checkbox"
																					name={field.name}
																					checked={field.value}
																					onChange={(e: any) => {
																						setFieldValue(
																							field.name,
																							e.target.checked,
																						);
																						if (!e.target.checked) {
																							setFieldValue(
																								"tcpForwarding",
																								true,
																							);
																						}
																					}}
																				/>
																			</label>
																		)}
																	</Field>
																</span>
															</label>
														</div>
													</div>
												</div>
											</div>
											<div className="tab-pane" id="tab-ssl" role="tabpanel">
												<SSLCertificateField
													name="certificateId"
													label="ssl-certificate"
													allowNew
													forHttp={false}
												/>
												<SSLOptionsFields
													color="bg-blue"
													forHttp={false}
													forceDNSForNew
													requireDomainNames
												/>
											</div>
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

export { showStreamModal };
