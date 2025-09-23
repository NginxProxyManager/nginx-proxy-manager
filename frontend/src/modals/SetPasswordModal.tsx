import { Field, Form, Formik } from "formik";
import { generate } from "generate-password-browser";
import { useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { updateAuth } from "src/api/backend";
import { Button } from "src/components";
import { intl } from "src/locale";
import { validateString } from "src/modules/Validations";

interface Props {
	userId: number;
	onClose: () => void;
}
export function SetPasswordModal({ userId, onClose }: Props) {
	const [error, setError] = useState<string | null>(null);
	const [showPassword, setShowPassword] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setError(null);
		try {
			await updateAuth(userId, values.new);
			onClose();
		} catch (err: any) {
			setError(intl.formatMessage({ id: err.message }));
		}
		setIsSubmitting(false);
		setSubmitting(false);
	};

	return (
		<Modal show onHide={onClose} animation={false}>
			<Formik
				initialValues={
					{
						new: "",
					} as any
				}
				onSubmit={onSubmit}
			>
				{() => (
					<Form>
						<Modal.Header closeButton>
							<Modal.Title>{intl.formatMessage({ id: "user.set-password" })}</Modal.Title>
						</Modal.Header>
						<Modal.Body>
							<Alert variant="danger" show={!!error} onClose={() => setError(null)} dismissible>
								{error}
							</Alert>
							<div className="mb-3">
								<Field name="new" validate={validateString(8, 100)}>
									{({ field, form }: any) => (
										<>
											<p className="text-end">
												<small>
													<a
														href="#"
														onClick={(e) => {
															e.preventDefault();
															form.setFieldValue(
																field.name,
																generate({
																	length: 12,
																	numbers: true,
																}),
															);
															setShowPassword(true);
														}}
													>
														{intl.formatMessage({
															id: "password.generate",
														})}
													</a>{" "}
													&mdash;{" "}
													<a
														href="#"
														className="text-xs"
														onClick={(e) => {
															e.preventDefault();
															setShowPassword(!showPassword);
														}}
													>
														{intl.formatMessage({
															id: showPassword ? "password.hide" : "password.show",
														})}
													</a>
												</small>
											</p>
											<div className="form-floating mb-3">
												<input
													id="new"
													type={showPassword ? "text" : "password"}
													required
													className={`form-control ${form.errors.new && form.touched.new ? "is-invalid" : ""}`}
													placeholder={intl.formatMessage({ id: "user.new-password" })}
													{...field}
												/>
												<label htmlFor="new">
													{intl.formatMessage({ id: "user.new-password" })}
												</label>

												{form.errors.new ? (
													<div className="invalid-feedback">
														{form.errors.new && form.touched.new ? form.errors.new : null}
													</div>
												) : null}
											</div>
										</>
									)}
								</Field>
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
		</Modal>
	);
}
