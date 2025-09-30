import { Field, Form, Formik } from "formik";
import { useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { Button, Loading, SSLCertificateField, SSLOptionsFields } from "src/components";
import { useSetStream, useStream } from "src/hooks";
import { intl } from "src/locale";
import { validateNumber, validateString } from "src/modules/Validations";
import { showSuccess } from "src/notifications";

interface Props {
	id: number | "new";
	onClose: () => void;
}
export function StreamModal({ id, onClose }: Props) {
	const { data, isLoading, error } = useStream(id);
	const { mutate: setStream } = useSetStream();
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		const { ...payload } = {
			id: id === "new" ? undefined : id,
			...values,
		};

		setStream(payload, {
			onError: (err: any) => setErrorMsg(err.message),
			onSuccess: () => {
				showSuccess(intl.formatMessage({ id: "notification.stream-saved" }));
				onClose();
			},
			onSettled: () => {
				setIsSubmitting(false);
				setSubmitting(false);
			},
		});
	};

	return (
		<Modal show onHide={onClose} animation={false}>
			{!isLoading && error && (
				<Alert variant="danger" className="m-3">
					{error?.message || "Unknown error"}
				</Alert>
			)}
			{isLoading && <Loading noLogo />}
			{!isLoading && data && (
				<Formik
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
					{({ setFieldValue }: any) => (
						<Form>
							<Modal.Header closeButton>
								<Modal.Title>
									{intl.formatMessage({ id: data?.id ? "stream.edit" : "stream.new" })}
								</Modal.Title>
							</Modal.Header>
							<Modal.Body className="p-0">
								<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible>
									{errorMsg}
								</Alert>

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
													{intl.formatMessage({ id: "column.details" })}
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
													{intl.formatMessage({ id: "column.ssl" })}
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
																{intl.formatMessage({ id: "stream.incoming-port" })}
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
																		{intl.formatMessage({
																			id: "stream.forward-host",
																		})}
																	</label>
																	<input
																		id="forwardingHost"
																		type="text"
																		className={`form-control ${form.errors.forwardingHost && form.touched.forwardingHost ? "is-invalid" : ""}`}
																		required
																		placeholder="example.com or 10.0.0.1 or 2001:db8:3333:4444:5555:6666:7777:8888"
																		{...field}
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
																		{intl.formatMessage({
																			id: "host.forward-port",
																		})}
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
														{intl.formatMessage({ id: "host.flags.protocols" })}
													</h3>
													<div className="divide-y">
														<div>
															<label className="row" htmlFor="tcpForwarding">
																<span className="col">
																	{intl.formatMessage({
																		id: "streams.tcp",
																	})}
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
																	{intl.formatMessage({
																		id: "streams.udp",
																	})}
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
								<Button data-bs-dismiss="modal" onClick={onClose} disabled={isSubmitting}>
									{intl.formatMessage({ id: "cancel" })}
								</Button>
								<Button
									type="submit"
									actionType="primary"
									className="ms-auto"
									data-bs-dismiss="modal"
									isLoading={isSubmitting}
									disabled={isSubmitting}
								>
									{intl.formatMessage({ id: "save" })}
								</Button>
							</Modal.Footer>
						</Form>
					)}
				</Formik>
			)}
		</Modal>
	);
}
