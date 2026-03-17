import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { Button, LoadBalancingFields, Loading } from "src/components";
import { useSetUpstreamHost, useUpstreamHost } from "src/hooks";
import { T } from "src/locale";
import { validateString } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";

const showUpstreamHostModal = (id: number | "new") => {
	EasyModal.show(UpstreamHostModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "new";
}
const UpstreamHostModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const { data, isLoading, error } = useUpstreamHost(id, ["servers"]);
	const { mutate: setUpstreamHost } = useSetUpstreamHost();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		const payload = {
			id: id === "new" ? undefined : id,
			...values,
		};

		setUpstreamHost(payload, {
			onError: (err: any) => setErrorMsg(<T id={err.message} />),
			onSuccess: () => {
				showObjectSuccess("upstream-host", "saved");
				remove();
			},
			onSettled: () => {
				setIsSubmitting(false);
				setSubmitting(false);
			},
		});
	};

	return (
		<Modal show={visible} onHide={remove}>
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
							name: data?.name || "",
							forwardScheme: data?.forwardScheme || "http",
							method: data?.method || "round_robin",
							servers: data?.servers || [],
						} as any
					}
					onSubmit={onSubmit}
				>
					{() => (
						<Form>
							<Modal.Header closeButton>
								<Modal.Title>
									<T id={data?.id ? "object.edit" : "object.add"} tData={{ object: "upstream-host" }} />
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
													href="#tab-servers"
													className="nav-link"
													data-bs-toggle="tab"
													aria-selected="false"
													tabIndex={-1}
													role="tab"
												>
													<T id="upstream-host.servers" />
												</a>
											</li>
										</ul>
									</div>
									<div className="card-body">
										<div className="tab-content">
											<div className="tab-pane active show" id="tab-details" role="tabpanel">
												<Field name="name" validate={validateString(1, 255)}>
													{({ field, form }: any) => (
														<div className="mb-3">
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
												<div className="row">
													<div className="col-md-6">
														<Field name="forwardScheme">
															{({ field }: any) => (
																<div className="mb-3">
																	<label className="form-label" htmlFor="forwardScheme">
																		<T id="host.forward-scheme" />
																	</label>
																	<select
																		id="forwardScheme"
																		className="form-control"
																		{...field}
																	>
																		<option value="http">http</option>
																		<option value="https">https</option>
																	</select>
																</div>
															)}
														</Field>
													</div>
													<div className="col-md-6">
														<Field name="method">
															{({ field }: any) => (
																<div className="mb-3">
																	<label className="form-label" htmlFor="method">
																		<T id="upstream-host.method" />
																	</label>
																	<select
																		id="method"
																		className="form-control"
																		{...field}
																	>
																		<option value="round_robin">
																			Round Robin
																		</option>
																		<option value="least_conn">
																			Least Connections
																		</option>
																		<option value="ip_hash">
																			IP Hash
																		</option>
																	</select>
																</div>
															)}
														</Field>
													</div>
												</div>
											</div>
											<div className="tab-pane" id="tab-servers" role="tabpanel">
												<LoadBalancingFields
													initialValues={data?.servers || []}
													name="servers"
												/>
											</div>
										</div>
									</div>
								</div>
							</Modal.Body>
							<Modal.Footer>
								<Button data-bs-dismiss="modal" onClick={remove} disabled={isSubmitting}>
									<T id="cancel" />
								</Button>
								<Button
									type="submit"
									actionType="primary"
									className="ms-auto bg-teal"
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
});

export { showUpstreamHostModal };
