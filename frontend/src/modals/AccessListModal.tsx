import cn from "classnames";
import { Field, Form, Formik } from "formik";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { BasicAuthField, Button, Loading } from "src/components";
import { useAccessList, useSetAccessList } from "src/hooks";
import { intl, T } from "src/locale";
import { validateString } from "src/modules/Validations";
import { showSuccess } from "src/notifications";

interface Props {
	id: number | "new";
	onClose: () => void;
}
export function AccessListModal({ id, onClose }: Props) {
	const { data, isLoading, error } = useAccessList(id);
	const { mutate: setAccessList } = useSetAccessList();
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

		setAccessList(payload, {
			onError: (err: any) => setErrorMsg(<T id={err.message} />),
			onSuccess: () => {
				showSuccess(intl.formatMessage({ id: "notification.access-saved" }));
				onClose();
			},
			onSettled: () => {
				setIsSubmitting(false);
				setSubmitting(false);
			},
		});
	};

	const toggleClasses = "form-check-input";
	const toggleEnabled = cn(toggleClasses, "bg-cyan");

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
							name: data?.name,
							satisfyAny: data?.satisfyAny,
							passAuth: data?.passAuth,
							// todo: more? there's stuff missing here?
							meta: data?.meta || {},
						} as any
					}
					onSubmit={onSubmit}
				>
					{({ setFieldValue }: any) => (
						<Form>
							<Modal.Header closeButton>
								<Modal.Title>
									<T id={data?.id ? "access.edit" : "access.new"} />
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
													href="#tab-auth"
													className="nav-link"
													data-bs-toggle="tab"
													aria-selected="false"
													tabIndex={-1}
													role="tab"
												>
													<T id="column.authorizations" />
												</a>
											</li>
											<li className="nav-item" role="presentation">
												<a
													href="#tab-access"
													className="nav-link"
													data-bs-toggle="tab"
													aria-selected="false"
													tabIndex={-1}
													role="tab"
												>
													<T id="column.rules" />
												</a>
											</li>
										</ul>
									</div>
									<div className="card-body">
										<div className="tab-content">
											<div className="tab-pane active show" id="tab-details" role="tabpanel">
												<Field name="name" validate={validateString(8, 255)}>
													{({ field }: any) => (
														<div>
															<label htmlFor="name" className="form-label">
																<T id="column.name" />
															</label>
															<input
																id="name"
																type="text"
																required
																autoComplete="off"
																className="form-control"
																{...field}
															/>
														</div>
													)}
												</Field>
												<div className="my-3">
													<h3 className="py-2">
														<T id="generic.flags.title" />
													</h3>
													<div className="divide-y">
														<div>
															<label className="row" htmlFor="satisfyAny">
																<span className="col">
																	<T id="access.satisfy-any" />
																</span>
																<span className="col-auto">
																	<Field name="satisfyAny" type="checkbox">
																		{({ field }: any) => (
																			<label className="form-check form-check-single form-switch">
																				<input
																					id="satisfyAny"
																					className={
																						field.value
																							? toggleEnabled
																							: toggleClasses
																					}
																					type="checkbox"
																					name={field.name}
																					checked={field.value}
																					onChange={(e: any) => {
																						setFieldValue(
																							field.name,
																							e.target.checked,
																						);
																					}}
																				/>
																			</label>
																		)}
																	</Field>
																</span>
															</label>
														</div>
														<div>
															<label className="row" htmlFor="passAuth">
																<span className="col">
																	<T id="access.pass-auth" />
																</span>
																<span className="col-auto">
																	<Field name="passAuth" type="checkbox">
																		{({ field }: any) => (
																			<label className="form-check form-check-single form-switch">
																				<input
																					id="passAuth"
																					className={
																						field.value
																							? toggleEnabled
																							: toggleClasses
																					}
																					type="checkbox"
																					name={field.name}
																					checked={field.value}
																					onChange={(e: any) => {
																						setFieldValue(
																							field.name,
																							e.target.checked,
																						);
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
											<div className="tab-pane" id="tab-auth" role="tabpanel">
												<BasicAuthField />
											</div>
											<div className="tab-pane" id="tab-rules" role="tabpanel">
												todo
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
									className="ms-auto bg-cyan"
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
