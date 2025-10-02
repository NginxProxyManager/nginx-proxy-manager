import { IconSettings } from "@tabler/icons-react";
import cn from "classnames";
import { Field, Form, Formik } from "formik";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import {
	AccessField,
	Button,
	DomainNamesField,
	Loading,
	NginxConfigField,
	SSLCertificateField,
	SSLOptionsFields,
} from "src/components";
import { useProxyHost, useSetProxyHost } from "src/hooks";
import { intl, T } from "src/locale";
import { validateNumber, validateString } from "src/modules/Validations";
import { showSuccess } from "src/notifications";

interface Props {
	id: number | "new";
	onClose: () => void;
}
export function ProxyHostModal({ id, onClose }: Props) {
	const { data, isLoading, error } = useProxyHost(id);
	const { mutate: setProxyHost } = useSetProxyHost();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		const { ...payload } = {
			id: id === "new" ? undefined : id,
			...values,
		};

		setProxyHost(payload, {
			onError: (err: any) => setErrorMsg(<T id={err.message} />),
			onSuccess: () => {
				showSuccess(intl.formatMessage({ id: "notification.proxy-host-saved" }));
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
							forwardScheme: data?.forwardScheme || "http",
							forwardHost: data?.forwardHost || "",
							forwardPort: data?.forwardPort || undefined,
							accessListId: data?.accessListId || 0,
							cachingEnabled: data?.cachingEnabled || false,
							blockExploits: data?.blockExploits || false,
							allowWebsocketUpgrade: data?.allowWebsocketUpgrade || false,
							// Locations tab
							locations: data?.locations || [],
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
									<T id={data?.id ? "proxy-host.edit" : "proxy-host.new"} />
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
													<T id="column.details" />
												</a>
											</li>
											<li className="nav-item" role="presentation">
												<a
													href="#tab-locations"
													className="nav-link"
													data-bs-toggle="tab"
													aria-selected="false"
													tabIndex={-1}
													role="tab"
												>
													<T id="column.custom-locations" />
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
													<div className="col-md-3">
														<Field name="forwardScheme">
															{({ field, form }: any) => (
																<div className="mb-3">
																	<label
																		className="form-label"
																		htmlFor="forwardScheme"
																	>
																		<T id="host.forward-scheme" />
																	</label>
																	<select
																		id="forwardScheme"
																		className={`form-control ${form.errors.forwardScheme && form.touched.forwardScheme ? "is-invalid" : ""}`}
																		required
																		{...field}
																	>
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
													<div className="col-md-6">
														<Field name="forwardHost" validate={validateString(1, 255)}>
															{({ field, form }: any) => (
																<div className="mb-3">
																	<label className="form-label" htmlFor="forwardHost">
																		<T id="proxy-host.forward-host" />
																	</label>
																	<input
																		id="forwardHost"
																		type="text"
																		className={`form-control ${form.errors.forwardHost && form.touched.forwardHost ? "is-invalid" : ""}`}
																		required
																		placeholder="example.com"
																		{...field}
																	/>
																	{form.errors.forwardHost ? (
																		<div className="invalid-feedback">
																			{form.errors.forwardHost &&
																			form.touched.forwardHost
																				? form.errors.forwardHost
																				: null}
																		</div>
																	) : null}
																</div>
															)}
														</Field>
													</div>
													<div className="col-md-3">
														<Field name="forwardPort" validate={validateNumber(1, 65535)}>
															{({ field, form }: any) => (
																<div className="mb-3">
																	<label className="form-label" htmlFor="forwardPort">
																		<T id="host.forward-port" />
																	</label>
																	<input
																		id="forwardPort"
																		type="number"
																		min={1}
																		max={65535}
																		className={`form-control ${form.errors.forwardPort && form.touched.forwardPort ? "is-invalid" : ""}`}
																		required
																		placeholder="eg: 8081"
																		{...field}
																	/>
																	{form.errors.forwardPort ? (
																		<div className="invalid-feedback">
																			{form.errors.forwardPort &&
																			form.touched.forwardPort
																				? form.errors.forwardPort
																				: null}
																		</div>
																	) : null}
																</div>
															)}
														</Field>
													</div>
												</div>
												<AccessField />
												<div className="my-3">
													<h4 className="py-2">
														<T id="generic.flags.title" />
													</h4>
													<div className="divide-y">
														<div>
															<label className="row" htmlFor="cachingEnabled">
																<span className="col">
																	<T id="host.flags.cache-assets" />
																</span>
																<span className="col-auto">
																	<Field name="cachingEnabled" type="checkbox">
																		{({ field }: any) => (
																			<label className="form-check form-check-single form-switch">
																				<input
																					{...field}
																					id="cachingEnabled"
																					className={cn("form-check-input", {
																						"bg-lime": field.checked,
																					})}
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
																	<T id="host.flags.block-exploits" />
																</span>
																<span className="col-auto">
																	<Field name="blockExploits" type="checkbox">
																		{({ field }: any) => (
																			<label className="form-check form-check-single form-switch">
																				<input
																					{...field}
																					id="blockExploits"
																					className={cn("form-check-input", {
																						"bg-lime": field.checked,
																					})}
																					type="checkbox"
																				/>
																			</label>
																		)}
																	</Field>
																</span>
															</label>
														</div>
														<div>
															<label className="row" htmlFor="allowWebsocketUpgrade">
																<span className="col">
																	<T id="host.flags.websockets-upgrade" />
																</span>
																<span className="col-auto">
																	<Field name="allowWebsocketUpgrade" type="checkbox">
																		{({ field }: any) => (
																			<label className="form-check form-check-single form-switch">
																				<input
																					{...field}
																					id="allowWebsocketUpgrade"
																					className={cn("form-check-input", {
																						"bg-lime": field.checked,
																					})}
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
											<div className="tab-pane" id="tab-locations" role="tabpanel">
												locations TODO
											</div>
											<div className="tab-pane" id="tab-ssl" role="tabpanel">
												<SSLCertificateField
													name="certificateId"
													label="ssl-certificate"
													allowNew
												/>
												<SSLOptionsFields color="bg-lime" />
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
									<T id="cancel" />
								</Button>
								<Button
									type="submit"
									actionType="primary"
									className="ms-auto bg-lime"
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
			)}
		</Modal>
	);
}
