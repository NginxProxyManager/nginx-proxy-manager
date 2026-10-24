import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { Button, Loading } from "src/components";
import { useSetUser, useUser } from "src/hooks";
import { intl, T } from "src/locale";
import { validateEmail, validateString } from "src/modules/Validations";
import { FULL_ADMIN, hasCapability } from "src/modules/Permissions";
import { showObjectSuccess } from "src/notifications";

export function buildUserPayload(id: number | "me" | "new", data: any, currentUser: any, values: any) {
	const payload: any = { id: id === "new" ? undefined : id, name: values.name, email: values.email };
	if (id === "new") {
		payload.isDisabled = values.isDisabled;
		payload.capabilities = values.isAdmin ? [FULL_ADMIN] : [];
	} else if (data?.id !== currentUser?.id) {
		payload.isDisabled = values.isDisabled;
		const wasAdmin = data?.capabilities?.includes(FULL_ADMIN) ?? false;
		if (values.isAdmin !== wasAdmin) {
			payload.capabilities = values.isAdmin
				? Array.from(new Set([...(data?.capabilities ?? []), FULL_ADMIN]))
				: (data?.capabilities ?? []).filter((capability: string) => capability !== FULL_ADMIN);
		}
	}
	if (typeof id === "number" && hasCapability(currentUser?.capabilities, FULL_ADMIN) &&
		values.isAdmin && values.passwordLoginEnabled !== data?.passwordLoginEnabled) {
		payload.passwordLoginEnabled = values.passwordLoginEnabled;
	}
	return payload;
}

const showUserModal = (id: number | "me" | "new") => {
	EasyModal.show(UserModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "me" | "new";
}
export function UserEditor({ id, visible, remove }: Props) {
	const { data, isLoading, error } = useUser(id);
	const { data: currentUser, isLoading: currentIsLoading } = useUser("me");
	const { mutate: setUser } = useSetUser();
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		const payload = buildUserPayload(id, data, currentUser, values);

		setUser(payload, {
			onError: (err: any) => setErrorMsg(err.message),
			onSuccess: () => {
				showObjectSuccess("user", "saved");
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
			{(isLoading || currentIsLoading) && <Loading noLogo />}
			{!isLoading && !currentIsLoading && data && currentUser && (
				<Formik
					initialValues={
						{
							name: data?.name,
							email: data?.email,
							isAdmin: data?.capabilities?.includes(FULL_ADMIN),
							passwordLoginEnabled: data?.passwordLoginEnabled ?? false,
							isDisabled: data?.isDisabled,
						} as any
					}
					onSubmit={onSubmit}
				>
					{() => (
						<Form>
							<Modal.Header closeButton>
								<Modal.Title>
									<T id={data?.id ? "object.edit" : "object.add"} tData={{ object: "user" }} />
								</Modal.Title>
							</Modal.Header>
							<Modal.Body>
								<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible>
									{errorMsg}
								</Alert>
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
													<T id="user.full-name" />
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
													<T id="email-address" />
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
								{currentUser && data && id !== "me" ? (
									<div className="my-3">
										<h4 className="py-2">
											<T id="options" />
										</h4>
										<div className="divide-y">
											<div>
												<label className="row" htmlFor="isAdmin">
													<span className="col">
														<T id="role.admin" />
													</span>
													<span className="col-auto">
														<Field name="isAdmin" type="checkbox">
															{({ field }: any) => (
																<label className="form-check form-check-single form-switch">
																	<input
																		{...field}
																		id="isAdmin"
																		disabled={currentUser.id === data.id}
																		className="form-check-input"
																		type="checkbox"
																	/>
																</label>
															)}
														</Field>
													</span>
												</label>
											</div>
											{hasCapability(currentUser.capabilities, FULL_ADMIN) ? (
												<div>
													<label className="row" htmlFor="passwordLoginEnabled">
														<span className="col"><T id="user.password-login-enabled" /></span>
												<span className="col-auto"><Field name="passwordLoginEnabled" type="checkbox">{({ field, form }: any) => <span className="form-check form-check-single form-switch"><input {...field} id="passwordLoginEnabled" className="form-check-input" type="checkbox" disabled={!form.values.isAdmin} /></span>}</Field></span>
													</label>
												</div>
											) : null}
											<div>
												<label className="row" htmlFor="isDisabled">
													<span className="col">
														<T id="disabled" />
													</span>
													<span className="col-auto">
														<Field name="isDisabled" type="checkbox">
															{({ field }: any) => (
																<label className="form-check form-check-single form-switch">
																	<input
																		{...field}
																		id="isDisabled"
																		disabled={currentUser.id === data.id}
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
								) : null}
							</Modal.Body>
							<Modal.Footer>
								<Button data-bs-dismiss="modal" onClick={remove} disabled={isSubmitting}>
									<T id="cancel" />
								</Button>
								<Button
									type="submit"
									className="ms-auto btn-orange"
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

const UserModal = EasyModal.create(UserEditor);

export { showUserModal };
