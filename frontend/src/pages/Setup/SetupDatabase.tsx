import { useQueryClient } from "@tanstack/react-query";
import cn from "classnames";
import { Field, Form, Formik } from "formik";
import { useState } from "react";
import { Alert } from "react-bootstrap";
import { type DatabaseConfig, setupDatabase } from "src/api/backend";
import { Button, LocalePicker, Page, ThemeSwitcher } from "src/components";
import { intl, T } from "src/locale";
import { validateNumber, validateString } from "src/modules/Validations";
import styles from "./SetupUser.module.css";

interface Payload {
	driver: string;
	host: string;
	port: string;
	username: string;
	password: string;
	name: string;
	sslmode: string;
	schema: string;
}

const defaultPorts: Record<string, string> = {
	postgres: "5432",
	mysql: "3306",
};

const sslModes = ["disable", "allow", "prefer", "require", "verify-ca", "verify-full"];

export default function SetupDatabase() {
	const queryClient = useQueryClient();
	const [errorMsg, setErrorMsg] = useState<string | null>(null);

	const onSubmit = async (values: Payload, { setSubmitting }: any) => {
		setErrorMsg(null);

		const payload: DatabaseConfig =
			values.driver === "sqlite"
				? { driver: values.driver }
				: {
						driver: values.driver,
						host: values.host,
						port: +values.port,
						username: values.username,
						password: values.password,
						name: values.name,
						...(values.driver === "postgres" ? { sslmode: values.sslmode, schema: values.schema } : {}),
					};

		try {
			await setupDatabase(payload);
			// Trigger a Health change, which moves on to the user setup step
			await queryClient.refetchQueries({ queryKey: ["health"] });
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
					<img
						className={styles.logo}
						src="/images/logo-text-horizontal-grey.png"
						alt="Nginx Proxy Manager"
					/>
				</div>
				<div className="card card-md">
					<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible>
						<h4 className="alert-heading">
							<T id="setup-database.error" />
						</h4>
						{errorMsg}
					</Alert>
					<Formik
						initialValues={
							{
								driver: "sqlite",
								host: "",
								port: "",
								username: "",
								password: "",
								name: "",
								sslmode: "disable",
								schema: "public",
							} as Payload
						}
						onSubmit={onSubmit}
					>
						{({ isSubmitting, values, handleChange, setFieldValue }) => (
							<Form>
								<div className="card-body text-center py-4 p-sm-5">
									<h1 className="mt-5">
										<T id="setup-database.title" />
									</h1>
									<p className="text-secondary">
										<T id="setup-database.description" />
									</p>
								</div>
								<hr />
								<div className="card-body">
									<Field name="driver">
										{({ field }: any) => (
											<div className="form-floating mb-3">
												<select
													id="driver"
													className="form-select"
													required
													{...field}
													onChange={(e) => {
														handleChange(e);
														// Swap the port along with the driver unless it's been customised
														if (
															values.port === "" ||
															Object.values(defaultPorts).includes(values.port)
														) {
															setFieldValue("port", defaultPorts[e.target.value] || "");
														}
													}}
												>
													<option value="sqlite">SQLite</option>
													<option value="postgres">PostgreSQL</option>
													<option value="mysql">MySQL / MariaDB</option>
												</select>
												<label htmlFor="driver">
													<T id="setup-database.driver" />
												</label>
											</div>
										)}
									</Field>
									{values.driver === "sqlite" ? (
										<p className="text-secondary small mb-0">
											<T id="setup-database.sqlite-description" />
										</p>
									) : (
										<>
											<Field name="host" validate={validateString(1, 255)}>
												{({ field, form }: any) => (
													<div className="form-floating mb-3">
														<input
															id="host"
															className={`form-control ${form.errors.host && form.touched.host ? "is-invalid" : ""}`}
															placeholder={intl.formatMessage({
																id: "setup-database.host",
															})}
															required
															{...field}
														/>
														<label htmlFor="host">
															<T id="setup-database.host" />
														</label>
														{form.errors.host ? (
															<div className="invalid-feedback">
																{form.errors.host && form.touched.host
																	? form.errors.host
																	: null}
															</div>
														) : null}
													</div>
												)}
											</Field>
											<Field name="port" validate={validateNumber(1, 65535)}>
												{({ field, form }: any) => (
													<div className="form-floating mb-3">
														<input
															id="port"
															type="number"
															className={`form-control ${form.errors.port && form.touched.port ? "is-invalid" : ""}`}
															placeholder={intl.formatMessage({
																id: "setup-database.port",
															})}
															required
															{...field}
														/>
														<label htmlFor="port">
															<T id="setup-database.port" />
														</label>
														{form.errors.port ? (
															<div className="invalid-feedback">
																{form.errors.port && form.touched.port
																	? form.errors.port
																	: null}
															</div>
														) : null}
													</div>
												)}
											</Field>
											<Field name="name" validate={validateString(1, 255)}>
												{({ field, form }: any) => (
													<div className="form-floating mb-3">
														<input
															id="name"
															className={`form-control ${form.errors.name && form.touched.name ? "is-invalid" : ""}`}
															placeholder={intl.formatMessage({
																id: "setup-database.name",
															})}
															required
															{...field}
														/>
														<label htmlFor="name">
															<T id="setup-database.name" />
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
											<Field name="username" validate={validateString(1, 255)}>
												{({ field, form }: any) => (
													<div className="form-floating mb-3">
														<input
															id="username"
															autoComplete="off"
															className={`form-control ${form.errors.username && form.touched.username ? "is-invalid" : ""}`}
															placeholder={intl.formatMessage({
																id: "setup-database.username",
															})}
															required
															{...field}
														/>
														<label htmlFor="username">
															<T id="setup-database.username" />
														</label>
														{form.errors.username ? (
															<div className="invalid-feedback">
																{form.errors.username && form.touched.username
																	? form.errors.username
																	: null}
															</div>
														) : null}
													</div>
												)}
											</Field>
											<Field name="password">
												{({ field }: any) => (
													<div className="form-floating mb-3">
														<input
															id="password"
															type="password"
															autoComplete="new-password"
															className="form-control"
															placeholder={intl.formatMessage({
																id: "setup-database.password",
															})}
															{...field}
														/>
														<label htmlFor="password">
															<T id="setup-database.password" />
														</label>
													</div>
												)}
											</Field>
											{values.driver === "postgres" ? (
												<>
													<Field name="schema" validate={validateString(1, 63)}>
														{({ field, form }: any) => (
															<div className="form-floating mb-3">
																<input
																	id="schema"
																	className={`form-control ${form.errors.schema && form.touched.schema ? "is-invalid" : ""}`}
																	placeholder={intl.formatMessage({
																		id: "setup-database.schema",
																	})}
																	required
																	{...field}
																/>
																<label htmlFor="schema">
																	<T id="setup-database.schema" />
																</label>
																{form.errors.schema ? (
																	<div className="invalid-feedback">
																		{form.errors.schema && form.touched.schema
																			? form.errors.schema
																			: null}
																	</div>
																) : null}
															</div>
														)}
													</Field>
													<Field name="sslmode">
														{({ field }: any) => (
															<div className="form-floating mb-3">
																<select
																	id="sslmode"
																	className="form-select"
																	required
																	{...field}
																>
																	{sslModes.map((mode) => (
																		<option key={mode} value={mode}>
																			{mode}
																		</option>
																	))}
																</select>
																<label htmlFor="sslmode">
																	<T id="setup-database.sslmode" />
																</label>
															</div>
														)}
													</Field>
												</>
											) : null}
										</>
									)}
								</div>
								<div className="text-center my-3 mx-3">
									<Button
										type="submit"
										actionType="primary"
										isLoading={isSubmitting}
										disabled={isSubmitting}
										className="w-100"
									>
										<T id="setup-database.submit" />
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
