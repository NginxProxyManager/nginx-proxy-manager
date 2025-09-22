import { IconSettings } from "@tabler/icons-react";
import { Form, Formik } from "formik";
import { useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { Button, DomainNamesField, Loading, SSLCertificateField, SSLOptionsFields } from "src/components";
import { useDeadHost } from "src/hooks";
import { intl } from "src/locale";

interface Props {
	id: number | "new";
	onClose: () => void;
}
export function DeadHostModal({ id, onClose }: Props) {
	const { data, isLoading, error } = useDeadHost(id);
	// const { mutate: setDeadHost } = useSetDeadHost();
	const [errorMsg, setErrorMsg] = useState<string | null>(null);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		setSubmitting(true);
		setErrorMsg(null);
		console.log("SUBMIT:", values);
		setSubmitting(false);
		// const { ...payload } = {
		// 	id: id === "new" ? undefined : id,
		// 	roles: [],
		// 	...values,
		// };

		// setDeadHost(payload, {
		// 	onError: (err: any) => setErrorMsg(err.message),
		// 	onSuccess: () => {
		// 		showSuccess(intl.formatMessage({ id: "notification.dead-host-saved" }));
		// 		onClose();
		// 	},
		// 	onSettled: () => setSubmitting(false),
		// });
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
							domainNames: data?.domainNames,
							certificateId: data?.certificateId,
							sslForced: data?.sslForced,
							advancedConfig: data?.advancedConfig,
							http2Support: data?.http2Support,
							hstsEnabled: data?.hstsEnabled,
							hstsSubdomains: data?.hstsSubdomains,
						} as any
					}
					onSubmit={onSubmit}
				>
					{({ isSubmitting }) => (
						<Form>
							<Modal.Header closeButton>
								<Modal.Title>
									{intl.formatMessage({ id: data?.id ? "dead-host.edit" : "dead-host.new" })}
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
												<h4>Advanced</h4>
											</div>
										</div>
									</div>
								</div>

								{/* <div className="row">
									<div className="col-lg-6">
										<div className="mb-3">
											<Field name="name" validate={validateString(1, 50)}>
												{({ field, form }: any) => (
													<div className="form-floating mb-3">
														<input
															id="name"
															className={`form-control ${form.errors.name && form.touched.name ? "is-invalid" : ""}`}
															placeholder={intl.formatMessage({ id: "user.full-name" })}
															{...field}
														/>
														<label htmlFor="name">
															{intl.formatMessage({ id: "user.full-name" })}
														</label>
														{form.errors.name ? (
															<div className="invalid-feedback">
																{form.errors.name && form.touched.name
																	? form.errors.name
																	: null}
															</div>
														) : null}
													</div>
												)}
											</Field>
										</div>
									</div>
									<div className="col-lg-6">
										<div className="mb-3">
											<Field name="nickname" validate={validateString(1, 30)}>
												{({ field, form }: any) => (
													<div className="form-floating mb-3">
														<input
															id="nickname"
															className={`form-control ${form.errors.nickname && form.touched.nickname ? "is-invalid" : ""}`}
															placeholder={intl.formatMessage({ id: "user.nickname" })}
															{...field}
														/>
														<label htmlFor="nickname">
															{intl.formatMessage({ id: "user.nickname" })}
														</label>
														{form.errors.nickname ? (
															<div className="invalid-feedback">
																{form.errors.nickname && form.touched.nickname
																	? form.errors.nickname
																	: null}
															</div>
														) : null}
													</div>
												)}
											</Field>
										</div>
									</div>
								</div>
								<div className="mb-3">
									<Field name="email" validate={validateEmail()}>
										{({ field, form }: any) => (
											<div className="form-floating mb-3">
												<input
													id="email"
													type="email"
													className={`form-control ${form.errors.email && form.touched.email ? "is-invalid" : ""}`}
													placeholder={intl.formatMessage({ id: "email-address" })}
													{...field}
												/>
												<label htmlFor="email">
													{intl.formatMessage({ id: "email-address" })}
												</label>
												{form.errors.email ? (
													<div className="invalid-feedback">
														{form.errors.email && form.touched.email
															? form.errors.email
															: null}
													</div>
												) : null}
											</div>
										)}
									</Field>
								</div>
								{currentUser && data && currentUser?.id !== data?.id ? (
									<div className="my-3">
										<h3 className="py-2">{intl.formatMessage({ id: "user.flags.title" })}</h3>
										<div className="divide-y">
											<div>
												<label className="row" htmlFor="isAdmin">
													<span className="col">
														{intl.formatMessage({ id: "role.admin" })}
													</span>
													<span className="col-auto">
														<Field name="isAdmin" type="checkbox">
															{({ field }: any) => (
																<label className="form-check form-check-single form-switch">
																	<input
																		{...field}
																		id="isAdmin"
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
												<label className="row" htmlFor="isDisabled">
													<span className="col">
														{intl.formatMessage({ id: "disabled" })}
													</span>
													<span className="col-auto">
														<Field name="isDisabled" type="checkbox">
															{({ field }: any) => (
																<label className="form-check form-check-single form-switch">
																	<input
																		{...field}
																		id="isDisabled"
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
								) : null} */}
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
