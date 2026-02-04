import { useQueryClient } from "@tanstack/react-query";
import { startRegistration } from "@simplewebauthn/browser";
import cn from "classnames";
import { Field, Form, Formik } from "formik";
import { useState } from "react";
import { Alert } from "react-bootstrap";
import {
	createUser,
	getPasskeyRegOptions,
	verifyPasskeyRegistration,
} from "src/api/backend";
import { Button, LocalePicker, Page, ThemeSwitcher } from "src/components";
import { useAuthState } from "src/context";
import { intl, T } from "src/locale";
import { validateEmail, validateString } from "src/modules/Validations";
import styles from "./index.module.css";

interface UserInfo {
	name: string;
	email: string;
}

type Step = "user-info" | "choose-method" | "password";

export default function Setup() {
	const queryClient = useQueryClient();
	const { authenticateWithToken } = useAuthState();
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
	const [step, setStep] = useState<Step>("user-info");
	const [passkeyLoading, setPasskeyLoading] = useState(false);
	const [passwordLoading, setPasswordLoading] = useState(false);
	const [passkeySupported] = useState(() => typeof window.PublicKeyCredential !== "undefined");

	const onUserInfoSubmit = async (values: UserInfo, { setSubmitting }: any) => {
		setErrorMsg(null);
		setUserInfo(values);
		setStep(passkeySupported ? "choose-method" : "password");
		setSubmitting(false);
	};

	const onPasswordSubmit = async (values: { password: string }, { setSubmitting }: any) => {
		if (!userInfo) return;
		setErrorMsg(null);
		setPasswordLoading(true);

		const nickname = userInfo.name.split(" ")[0];

		try {
			const result = await createUser(
				{
					name: userInfo.name,
					email: userInfo.email,
					nickname,
					auth: { type: "password", secret: values.password },
				},
				true,
			);
			if (result?.id) {
				authenticateWithToken({ token: (result as any).token, expires: (result as any).expires });
				await queryClient.refetchQueries({ queryKey: ["health"] });
			} else {
				setErrorMsg("cannot_create_user");
			}
		} catch (err: any) {
			setErrorMsg(err.message);
		}
		setPasswordLoading(false);
		setSubmitting(false);
	};

	const onPasskeySetup = async () => {
		if (!userInfo) return;
		setErrorMsg(null);
		setPasskeyLoading(true);

		const nickname = userInfo.name.split(" ")[0];

		try {
			const result = await createUser(
				{ name: userInfo.name, email: userInfo.email, nickname },
				true,
			);

			if (!result?.id) {
				setErrorMsg("cannot_create_user");
				setPasskeyLoading(false);
				return;
			}

			// Store the token so passkey registration API calls are authenticated
			authenticateWithToken({ token: (result as any).token, expires: (result as any).expires });

			// Now register a passkey
			try {
				const regOptions = await getPasskeyRegOptions(result.id);
				const credential = await startRegistration({ optionsJSON: regOptions.options });
				await verifyPasskeyRegistration(
					result.id,
					regOptions.challengeToken,
					JSON.stringify(credential),
					"Setup passkey",
				);
			} catch {
				// If passkey registration fails (user cancels, device error, etc.),
				// the user is already created and authenticated. They can configure
				// auth from the settings menu.
			}

			await queryClient.refetchQueries({ queryKey: ["health"] });
		} catch (err: any) {
			setErrorMsg(err.message);
		}
		setPasskeyLoading(false);
	};

	const renderUserInfo = () => (
		<Formik
			initialValues={{ name: "", email: "" }}
			onSubmit={onUserInfoSubmit}
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
					</div>
					<div className="text-center my-3 mx-3">
						<Button
							type="submit"
							actionType="primary"
							isLoading={isSubmitting}
							disabled={isSubmitting}
							className="w-100"
						>
							<T id="setup.next" />
						</Button>
					</div>
				</Form>
			)}
		</Formik>
	);

	const renderChooseMethod = () => (
		<>
			<div className="card-body text-center py-4 p-sm-5">
				<h1 className="mt-5">
					<T id="setup.title" />
				</h1>
				<p className="text-secondary">
					<T id="setup.choose-auth-method" />
				</p>
			</div>
			<hr />
			<div className="card-body">
				<Button
					type="button"
					actionType="primary"
					className="w-100"
					onClick={() => setStep("password")}
				>
					<T id="setup.create-with-password" />
				</Button>
				<div className="hr-text my-4">
					<T id="login.or" />
				</div>
				<Button
					type="button"
					actionType="primary"
					className="w-100"
					onClick={onPasskeySetup}
					isLoading={passkeyLoading}
					disabled={passkeyLoading}
				>
					<T id="setup.create-with-passkey" />
				</Button>
			</div>
		</>
	);

	const renderPassword = () => (
		<Formik
			initialValues={{ password: "" }}
			onSubmit={onPasswordSubmit}
		>
			{({ isSubmitting }) => (
				<Form>
					<div className="card-body text-center py-4 p-sm-5">
						<h1 className="mt-5">
							<T id="setup.title" />
						</h1>
						<p className="text-secondary">
							<T id="setup.choose-auth-method" />
						</p>
					</div>
					<hr />
					<div className="card-body">
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
							isLoading={isSubmitting || passwordLoading}
							disabled={isSubmitting || passwordLoading}
							className="w-100"
						>
							<T id="save" />
						</Button>
					</div>
				</Form>
			)}
		</Formik>
	);

	const renderStep = () => {
		switch (step) {
			case "choose-method":
				return renderChooseMethod();
			case "password":
				return renderPassword();
			default:
				return renderUserInfo();
		}
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
						{errorMsg}
					</Alert>
					{renderStep()}
				</div>
			</div>
		</Page>
	);
}
