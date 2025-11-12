import cn from "classnames";
import { Field, Form, Formik } from "formik";
import { useEffect, useRef, useState } from "react";
import Alert from "react-bootstrap/Alert";
import { Button, LocalePicker, Page, ThemeSwitcher } from "src/components";
import { useAuthState } from "src/context";
import { useHealth } from "src/hooks";
import { intl, T } from "src/locale";
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
			<div className="container container-tight py-4">
				<div className="d-flex justify-content-between align-items-center mb-4 ps-4 pe-3">
					<img
						className={styles.logo}
						src="/images/logo-text-horizontal-grey.png"
						alt="Nginx Proxy Manager"
					/>
					<div className={cn("d-flex", "align-items-center", "gap-1")}>
						<LocalePicker />
						<ThemeSwitcher />
					</div>
				</div>
				<div className="card card-md">
					<div className="card-body">
						<h2 className="h2 text-center mb-4">
							<T id="login.title" />
						</h2>
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
													<T id="email-address" />
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
														<T id="password" />
														<input
															{...field}
															type="password"
															autoComplete="current-password"
															required
															maxLength={255}
															className={`form-control ${form.errors.password && form.touched.password ? " is-invalid" : ""}`}
															placeholder="Password"
														/>
														<div className="invalid-feedback">{form.errors.password}</div>
													</label>
												</>
											)}
										</Field>
									</div>
									<div className="form-footer">
										<Button type="submit" fullWidth color="azure" isLoading={isSubmitting}>
											<T id="sign-in" />
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
