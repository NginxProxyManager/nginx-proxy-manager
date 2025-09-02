import cn from "classnames";
import { Field, Form, Formik } from "formik";
import { useEffect, useRef, useState } from "react";
import Alert from "react-bootstrap/Alert";
import { Button, LocalePicker, Page, ThemeSwitcher } from "src/components";
import { useAuthState } from "src/context";
import { useHealth } from "src/hooks";
import { intl } from "src/locale";
import { validateEmail, validateString } from "src/modules/Validations";
import styles from "./index.module.css";

export default function Login() {
	const emailRef = useRef(null);
	const [formErr, setFormErr] = useState("");
	const { login } = useAuthState();

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		setFormErr("");
		try {
			await login(values.email, values.password);
		} catch (err) {
			if (err instanceof Error) {
				setFormErr(err.message);
			}
		}
		setSubmitting(false);
	};

	useEffect(() => {
		// @ts-expect-error ts-migrate(2531) FIXME: Object is possibly 'null'.
		emailRef.current.focus();
	}, []);

	const health = useHealth();

	const getVersion = () => {
		if (!health.data) {
			return "";
		}
		const v = health.data.version;
		return `v${v.major}.${v.minor}.${v.revision}`;
	};

	return (
		<Page className="page page-center">
			<div className={cn("d-none", "d-md-flex", styles.helperBtns)}>
				<LocalePicker />
				<ThemeSwitcher />
			</div>
			<div className="container container-tight py-4">
				<div className="text-center mb-4">
					<img
						className={styles.logo}
						src="/images/logo-text-horizontal-grey.png"
						alt="Nginx Proxy Manager"
					/>
				</div>
				<div className="card card-md">
					<div className="card-body">
						<h2 className="h2 text-center mb-4">{intl.formatMessage({ id: "login.title" })}</h2>
						{formErr !== "" && <Alert variant="danger">{formErr}</Alert>}
						<Formik
							initialValues={
								{
									email: "",
									password: "",
								} as any
							}
							onSubmit={onSubmit}
						>
							{({ isSubmitting }) => (
								<Form>
									<div className="mb-3">
										<Field name="email" validate={validateEmail()}>
											{({ field, form }: any) => (
												<label className="form-label">
													{intl.formatMessage({ id: "email-address" })}
													<input
														{...field}
														ref={emailRef}
														type="email"
														required
														className={`form-control ${form.errors.email && form.touched.email ? " is-invalid" : ""}`}
														placeholder={intl.formatMessage({ id: "email-address" })}
													/>
													<div className="invalid-feedback">{form.errors.email}</div>
												</label>
											)}
										</Field>
									</div>
									<div className="mb-2">
										<Field name="password" validate={validateString(8, 255)}>
											{({ field, form }: any) => (
												<>
													<label className="form-label">
														{intl.formatMessage({ id: "password" })}
														<input
															{...field}
															type="password"
															required
															maxLength={255}
															className={`form-control ${form.errors.password && form.touched.password ? " is-invalid" : ""}`}
															placeholder="Password"
															autoComplete="off"
														/>
														<div className="invalid-feedback">{form.errors.password}</div>
													</label>
												</>
											)}
										</Field>
									</div>
									<div className="form-footer">
										<Button type="submit" fullWidth color="azure" isLoading={isSubmitting}>
											{intl.formatMessage({ id: "sign-in" })}
										</Button>
									</div>
								</Form>
							)}
						</Formik>
					</div>
				</div>
				<div className="text-center text-secondary mt-3">{getVersion()}</div>
			</div>
		</Page>
	);
}
