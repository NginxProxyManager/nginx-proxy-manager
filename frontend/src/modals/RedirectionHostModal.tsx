import { IconSettings } from "@tabler/icons-react";
import { Field, Form, Formik } from "formik";
import { useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import {
	Button,
	DomainNamesField,
	Loading,
	NginxConfigField,
	SSLCertificateField,
	SSLOptionsFields,
} from "src/components";
import { useRedirectionHost, useSetRedirectionHost } from "src/hooks";
import { intl } from "src/locale";
import { validateString } from "src/modules/Validations";
import { showSuccess } from "src/notifications";

interface Props {
	id: number | "new";
	onClose: () => void;
}
export function RedirectionHostModal({ id, onClose }: Props) {
	const { data, isLoading, error } = useRedirectionHost(id);
	const { mutate: setRedirectionHost } = useSetRedirectionHost();
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

		setRedirectionHost(payload, {
			onError: (err: any) => setErrorMsg(err.message),
			onSuccess: () => {
				showSuccess(intl.formatMessage({ id: "notification.redirection-host-saved" }));
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
							// Details tab
							domainNames: data?.domainNames || [],
							forwardDomainName: data?.forwardDomainName || "",
							forwardScheme: data?.forwardScheme || "auto",
							forwardHttpCode: data?.forwardHttpCode || 301,
							preservePath: data?.preservePath || false,
							blockExploits: data?.blockExploits || false,
							// SSL tab
							certificateId: data?.certificateId || 0,
							sslForced: data?.sslForced || false,
							http2Support: data?.http2Support || false,
							hstsEnabled: data?.hstsEnabled || false,
							hstsSubdomains: data?.hstsSubdomains || false,
							// Advanced tab
							advancedConfig: data?.advancedConfig || "",
							meta: data?.meta || {},
						} as any
					}
					onSubmit={onSubmit}
				>
					{() => (
						<Form>
							<Modal.Header closeButton>
								<Modal.Title>
									{intl.formatMessage({
										id: data?.id ? "redirection-host.edit" : "redirection-host.new",
									})}
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
										</ul>
									</div>
									<div className="card-body">
										<div className="tab-content">
											<div className="tab-pane active show" id="tab-details" role="tabpanel">
												<DomainNamesField isWildcardPermitted />
												<div className="row">
													<div className="col-md-4">
														<Field name="forwardScheme">
															{({ field, form }: any) => (
																<div className="mb-3">
																	<label
																		className="form-label"
																		htmlFor="forwardScheme"
																	>
																		{intl.formatMessage({
																			id: "redirect-host.forward-scheme",
																		})}
																	</label>
																	<select
																		id="forwardScheme"
																		className={`form-control ${form.errors.forwardScheme && form.touched.forwardScheme ? "is-invalid" : ""}`}
																		required
																		{...field}
																	>
																		<option value="$scheme">Auto</option>
																		<option value="http">http</option>
																		<option value="https">https</option>
																	</select>
																	{form.errors.forwardScheme ? (
																		<div className="invalid-feedback">
																			{form.errors.forwardScheme &&
																			form.touched.forwardScheme
																				? form.errors.forwardScheme
																				: null}
																		</div>
																	) : null}
																</div>
															)}
														</Field>
													</div>
													<div className="col-md-8">
														<Field
															name="forwardDomainName"
															validate={validateString(1, 255)}
														>
															{({ field, form }: any) => (
																<div className="mb-3">
																	<label
																		className="form-label"
																		htmlFor="forwardDomainName"
																	>
																		{intl.formatMessage({
																			id: "redirect-host.forward-domain",
																		})}
																	</label>
																	<input
																		id="forwardDomainName"
																		type="text"
																		className={`form-control ${form.errors.forwardDomainName && form.touched.forwardDomainName ? "is-invalid" : ""}`}
																		required
																		placeholder="example.com"
																		{...field}
																	/>
																	{form.errors.forwardDomainName ? (
																		<div className="invalid-feedback">
																			{form.errors.forwardDomainName &&
																			form.touched.forwardDomainName
																				? form.errors.forwardDomainName
																				: null}
																		</div>
																	) : null}
																</div>
															)}
														</Field>
													</div>
												</div>
												<div className="my-3">
													<h4 className="py-2">
														{intl.formatMessage({ id: "host.flags.title" })}
													</h4>
													<div className="divide-y">
														<div>
															<label className="row" htmlFor="preservePath">
																<span className="col">
																	{intl.formatMessage({
																		id: "host.flags.preserve-path",
																	})}
																</span>
																<span className="col-auto">
																	<Field name="preservePath" type="checkbox">
																		{({ field }: any) => (
																			<label className="form-check form-check-single form-switch">
																				<input
																					{...field}
																					id="preservePath"
																					className="form-check-input"
																					type="checkbox"
																				/>
																			</label>
																		)}
																	</Field>
																</span>
															</label>
														</div>
														<div>
															<label className="row" htmlFor="blockExploits">
																<span className="col">
																	{intl.formatMessage({
																		id: "host.flags.block-exploits",
																	})}
																</span>
																<span className="col-auto">
																	<Field name="blockExploits" type="checkbox">
																		{({ field }: any) => (
																			<label className="form-check form-check-single form-switch">
																				<input
																					{...field}
																					id="blockExploits"
																					className="form-check-input"
																					type="checkbox"
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
												/>
												<SSLOptionsFields />
											</div>
											<div className="tab-pane" id="tab-advanced" role="tabpanel">
												<NginxConfigField />
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
