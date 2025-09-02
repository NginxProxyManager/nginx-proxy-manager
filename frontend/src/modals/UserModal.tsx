import { Field, Form, Formik } from "formik";
import { useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { Button } from "src/components";
import { useSetUser, useUser } from "src/hooks";
import { intl } from "src/locale";
import { validateEmail, validateString } from "src/modules/Validations";

interface Props {
	userId: number | "me";
	onClose: () => void;
}
export function UserModal({ userId, onClose }: Props) {
	const { data } = useUser(userId);
	const { data: currentUser } = useUser("me");
	const { mutate: setUser } = useSetUser();
	const [error, setError] = useState<string | null>(null);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		setError(null);
		const { ...payload } = {
			id: userId,
			roles: [],
			...values,
		};

		console.log("values", values);

		if (data?.id === currentUser?.id) {
			// Prevent user from locking themselves out
			delete payload.isDisabled;
			delete payload.roles;
		} else if (payload.isAdmin) {
			payload.roles = ["admin"];
		}

		// this isn't a real field, just for the form
		delete payload.isAdmin;

		setUser(payload, {
			onError: (err: any) => setError(err.message),
			onSuccess: () => onClose(),
			onSettled: () => setSubmitting(false),
		});
	};

	return (
		<Modal show onHide={onClose} animation={false}>
			<Formik
				initialValues={
					{
						name: data?.name,
						nickname: data?.nickname,
						email: data?.email,
						isAdmin: data?.roles.includes("admin"),
						isDisabled: data?.isDisabled,
					} as any
				}
				onSubmit={onSubmit}
			>
				{({ isSubmitting }) => (
					<Form>
						<Modal.Header closeButton>
							<Modal.Title>{intl.formatMessage({ id: "user.edit" })}</Modal.Title>
						</Modal.Header>
						<Modal.Body>
							<Alert variant="danger" show={!!error} onClose={() => setError(null)} dismissible>
								{error}
							</Alert>
							<div className="row">
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
											<label htmlFor="email">{intl.formatMessage({ id: "email-address" })}</label>
											{form.errors.email ? (
												<div className="invalid-feedback">
													{form.errors.email && form.touched.email ? form.errors.email : null}
												</div>
											) : null}
										</div>
									)}
								</Field>
							</div>
							{currentUser && data && currentUser?.id !== data?.id ? (
								<div className="my-3">
									<h3 className="py-2">Properties</h3>

									<div className="divide-y">
										<div>
											<label className="row" htmlFor="isAdmin">
												<span className="col">Administrator</span>
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
												<span className="col">Disabled</span>
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
							) : null}
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
		</Modal>
	);
}
