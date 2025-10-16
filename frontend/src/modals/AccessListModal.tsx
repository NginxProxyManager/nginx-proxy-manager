import cn from "classnames";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import type { AccessList, AccessListClient, AccessListItem } from "src/api/backend";
import { AccessClientFields, BasicAuthFields, Button, Loading } from "src/components";
import { useAccessList, useSetAccessList } from "src/hooks";
import { intl, T } from "src/locale";
import { validateString } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";

const showAccessListModal = (id: number | "new") => {
	EasyModal.show(AccessListModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "new";
}
const AccessListModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const { data, isLoading, error } = useAccessList(id, ["items", "clients"]);
	const { mutate: setAccessList } = useSetAccessList();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const validate = (values: any): string | null => {
		// either Auths or Clients must be defined
		if (values.items?.length === 0 && values.clients?.length === 0) {
			return intl.formatMessage({ id: "error.access.at-least-one" });
		}

		// ensure the items don't contain the same username twice
		const usernames = values.items.map((i: any) => i.username);
		const uniqueUsernames = Array.from(new Set(usernames));
		if (usernames.length !== uniqueUsernames.length) {
			return intl.formatMessage({ id: "error.access.duplicate-usernames" });
		}

		return null;
	};

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;

		const vErr = validate(values);
		if (vErr) {
			setErrorMsg(vErr);
			return;
		}

		setIsSubmitting(true);
		setErrorMsg(null);

		const { ...payload } = {
			id: id === "new" ? undefined : id,
			...values,
		};

		// Filter out "items" to only use the "username" and "password" fields
		payload.items = (values.items || []).map((i: AccessListItem) => ({
			username: i.username,
			password: i.password,
		}));

		// Filter out "clients" to only use the "directive" and "address" fields
		payload.clients = (values.clients || []).map((i: AccessListClient) => ({
			directive: i.directive,
			address: i.address,
		}));

		setAccessList(payload, {
			onError: (err: any) => setErrorMsg(<T id={err.message} />),
			onSuccess: () => {
				showObjectSuccess("access-list", "saved");
				remove();
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
							name: data?.name,
							satisfyAny: data?.satisfyAny,
							passAuth: data?.passAuth,
							items: data?.items || [],
							clients: data?.clients || [],
						} as AccessList
					}
					onSubmit={onSubmit}
				>
					{({ setFieldValue }: any) => (
						<Form>
							<Modal.Header closeButton>
								<Modal.Title>
									<T id={data?.id ? "object.edit" : "object.add"} tData={{ object: "access-list" }} />
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
													href="#tab-rules"
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
												<Field name="name" validate={validateString(1, 255)}>
													{({ field, form }: any) => (
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
												<div className="my-3">
													<h3 className="py-2">
														<T id="options" />
													</h3>
													<div className="divide-y">
														<div>
															<label className="row" htmlFor="satisfyAny">
																<span className="col">
																	<T id="access-list.satisfy-any" />
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
																	<T id="access-list.pass-auth" />
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
												<BasicAuthFields initialValues={data?.items || []} />
											</div>
											<div className="tab-pane" id="tab-rules" role="tabpanel">
												<AccessClientFields initialValues={data?.clients || []} />
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
});

export { showAccessListModal };
