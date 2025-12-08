import { useQueryClient } from "@tanstack/react-query";
import cn from "classnames";
import { Field, Form, Formik } from "formik";
import { useState } from "react";
import { Alert } from "react-bootstrap";
import { createUser } from "src/api/backend";
import { Button, LocalePicker, Page, ThemeSwitcher } from "src/components";
import { useAuthState } from "src/context";
import { intl, T } from "src/locale";
import { validateEmail, validateString } from "src/modules/Validations";
import styles from "./index.module.css";

interface Payload {
	name: string;
	email: string;
	password: string;
}

export default function Setup() {
	const queryClient = useQueryClient();
	const { login } = useAuthState();
	const [errorMsg, setErrorMsg] = useState<string | null>(null);

	const onSubmit = async (values: Payload, { setSubmitting }: any) => {
		setErrorMsg(null);

		// Set a nickname, which is the first word of the name
		const nickname = values.name.split(" ")[0];

		const { password, ...payload } = {
			...values,
			...{
				nickname,
				auth: {
					type: "password",
					secret: values.password,
				},
			},
		};

		try {
			const user = await createUser(payload);
			if (user?.id) {
				try {
					await login(user.email, password);
					// Trigger a Health change
					await queryClient.refetchQueries({ queryKey: ["health"] });
					// window.location.reload();
				} catch (err: any) {
					setErrorMsg(err.message);
				}
			} else {
				setErrorMsg("cannot_create_user");
			}
		} catch (err: any) {
			setErrorMsg(err.message);
		}
		setSubmitting(false);
	};

	return (
		<Page className="page page-center">
			<div className={cn("d-none", "d-md-flex", styles.helperBtns)}>
				<LocalePicker />
				<ThemeSwitcher />
			</div>
			<div className="container container-tight py-4">
				<div className="text-center mb-4">
					<img className={styles.logo} src="/images/logo-text-horizontal-grey.png" alt="NPMplus" />
				</div>
				<div className="card card-md">
					<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible>
						{errorMsg}
					</Alert>
					<Formik
						initialValues={
							{
								name: "",
								email: "",
								password: "",
							} as any
						}
						onSubmit={onSubmit}
					>
						{({ isSubmitting }) => (
							<Form>
								<div className="card-body text-center py-4 p-sm-5">
									<h1 className="mt-5">
										<T id="setup.title" />
									</h1>
									<p className="text-secondary">
										<T id="setup.preamble" />
									</p>
								</div>
								<hr />
								<div className="card-body">
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
									<div className="mb-3">
										<Field name="password" validate={validateString(8, 100)}>
											{({ field, form }: any) => (
												<div className="form-floating mb-3">
													<input
														id="password"
														type="password"
														autoComplete="new-password"
														className={`form-control ${form.errors.password && form.touched.password ? "is-invalid" : ""}`}
														placeholder={intl.formatMessage({ id: "user.new-password" })}
														{...field}
													/>
													<label htmlFor="password">
														<T id="user.new-password" />
													</label>
													{form.errors.password ? (
														<div className="invalid-feedback">
															{form.errors.password && form.touched.password
																? form.errors.password
																: null}
														</div>
													) : null}
												</div>
											)}
										</Field>
									</div>
								</div>
								<div className="text-center my-3 mx-3">
									<Button
										type="submit"
										actionType="primary"
										data-bs-dismiss="modal"
										isLoading={isSubmitting}
										disabled={isSubmitting}
										className="w-100"
									>
										<T id="save" />
									</Button>
								</div>
							</Form>
						)}
					</Formik>
				</div>
			</div>
		</Page>
	);
}
