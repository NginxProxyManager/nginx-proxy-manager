import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { updateAuth } from "src/api/backend";
import { Button } from "src/components";
import { intl, T } from "src/locale";
import { validateString } from "src/modules/Validations";

const showChangePasswordModal = (id: number | "me") => {
	EasyModal.show(ChangePasswordModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "me";
}
const ChangePasswordModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const [error, setError] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (values.new !== values.confirm) {
			setError(<T id="error.passwords-must-match" />);
			setSubmitting(false);
			return;
		}

		if (isSubmitting) return;
		setIsSubmitting(true);
		setError(null);

		try {
			await updateAuth(id, values.new, values.current);
			remove();
		} catch (err: any) {
			setError(<T id={err.message} />);
		}
		setIsSubmitting(false);
		setSubmitting(false);
	};

	return (
		<Modal show={visible} onHide={remove}>
			<Formik
				initialValues={
					{
						current: "",
						new: "",
						confirm: "",
					} as any
				}
				onSubmit={onSubmit}
			>
				{() => (
					<Form>
						<Modal.Header closeButton>
							<Modal.Title>
								<T id="user.change-password" />
							</Modal.Title>
						</Modal.Header>
						<Modal.Body>
							<Alert variant="danger" show={!!error} onClose={() => setError(null)} dismissible>
								{error}
							</Alert>
							<div className="mb-3">
								<Field name="current">
									{({ field, form }: any) => (
										<div className="form-floating mb-3">
											<input
												id="current"
												type="password"
												autoComplete="current-password"
												required
												className={`form-control ${form.errors.current && form.touched.current ? "is-invalid" : ""}`}
												placeholder={intl.formatMessage({
													id: "user.current-password",
												})}
												{...field}
											/>
											<label htmlFor="current">
												<T id="user.current-password" />
											</label>
											{form.errors.name ? (
												<div className="invalid-feedback">
													{form.errors.current && form.touched.current
														? form.errors.current
														: null}
												</div>
											) : null}
										</div>
									)}
								</Field>
							</div>
							<div className="mb-3">
								<Field name="new" validate={validateString(8, 100)}>
									{({ field, form }: any) => (
										<div className="form-floating mb-3">
											<input
												id="new"
												type="password"
												autoComplete="new-password"
												required
												className={`form-control ${form.errors.new && form.touched.new ? "is-invalid" : ""}`}
												placeholder={intl.formatMessage({ id: "user.new-password" })}
												{...field}
											/>
											<label htmlFor="new">
												<T id="user.new-password" />
											</label>
											{form.errors.new ? (
												<div className="invalid-feedback">
													{form.errors.new && form.touched.new ? form.errors.new : null}
												</div>
											) : null}
										</div>
									)}
								</Field>
							</div>
							<div className="mb-3">
								<Field name="confirm" validate={validateString(8, 100)}>
									{({ field, form }: any) => (
										<div className="form-floating mb-3">
											<input
												id="confirm"
												type="password"
												autoComplete="new-password"
												required
												className={`form-control ${form.errors.confirm && form.touched.confirm ? "is-invalid" : ""}`}
												placeholder={intl.formatMessage({ id: "user.confirm-password" })}
												{...field}
											/>
											{form.errors.confirm ? (
												<div className="invalid-feedback">
													{form.errors.confirm && form.touched.confirm
														? form.errors.confirm
														: null}
												</div>
											) : null}
											<label htmlFor="confirm">
												<T id="user.confirm-password" />
											</label>
										</div>
									)}
								</Field>
							</div>
						</Modal.Body>
						<Modal.Footer>
							<Button data-bs-dismiss="modal" onClick={remove} disabled={isSubmitting}>
								<T id="cancel" />
							</Button>
							<Button
								type="submit"
								actionType="primary"
								className="ms-auto"
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
		</Modal>
	);
});

export { showChangePasswordModal };
