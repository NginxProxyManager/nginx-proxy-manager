import { IconKey, IconShieldLock } from "@tabler/icons-react";
import { Field, Form, Formik } from "formik";
import { useEffect, useRef, useState } from "react";
import Alert from "react-bootstrap/Alert";
import { type LoginOptions, type LoginProvider, providerLoginUrl } from "src/api/backend";
import { Button, Loading, LocalePicker, Page, ThemeSwitcher } from "src/components";
import { useAuthState } from "src/context";
import { useHealth, useLoginOptions } from "src/hooks";
import { intl, T } from "src/locale";
import { validateString } from "src/modules/Validations";
import styles from "./index.module.css";

function TwoFactorForm() {
	const codeRef = useRef<HTMLInputElement>(null);
	const [formErr, setFormErr] = useState("");
	const { verifyTwoFactor, cancelTwoFactor } = useAuthState();

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		setFormErr("");
		try {
			await verifyTwoFactor(values.code);
		} catch (err) {
			if (err instanceof Error) {
				setFormErr(err.message);
			}
		}
		setSubmitting(false);
	};

	useEffect(() => {
		codeRef.current?.focus();
	}, []);

	return (
		<>
			<h2 className="h2 text-center mb-4">
				<T id="login.2fa-title" />
			</h2>
			<p className="text-secondary text-center mb-4">
				<T id="login.2fa-description" />
			</p>
			{formErr !== "" && <Alert variant="danger">{formErr}</Alert>}
			<Formik initialValues={{ code: "" }} onSubmit={onSubmit}>
				{({ isSubmitting }) => (
					<Form>
						<div className="mb-3">
							<Field name="code" validate={validateString(6, 20)}>
								{({ field, form }: any) => (
									<label className="form-label">
										<T id="login.2fa-code" />
										<input
											{...field}
											ref={codeRef}
											type="text"
											inputMode="numeric"
											autoComplete="one-time-code"
											required
											maxLength={20}
											className={`form-control ${form.errors.code && form.touched.code ? "is-invalid" : ""}`}
											placeholder={intl.formatMessage({ id: "login.2fa-code-placeholder" })}
										/>
										<div className="invalid-feedback">{form.errors.code}</div>
									</label>
								)}
							</Field>
						</div>
						<div className="form-footer d-flex gap-2">
							<Button type="button" fullWidth onClick={cancelTwoFactor} disabled={isSubmitting}>
								<T id="cancel" />
							</Button>
							<Button type="submit" fullWidth color="azure" isLoading={isSubmitting}>
								<T id="login.2fa-verify" />
							</Button>
						</div>
					</Form>
				)}
			</Formik>
		</>
	);
}

interface LoginFormProps {
	/** LDAP identities are often a plain username, so don't insist on an email */
	allowUsername: boolean;
}
function LoginForm({ allowUsername }: LoginFormProps) {
	const emailRef = useRef<HTMLInputElement>(null);
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
		emailRef.current?.focus();
	}, []);

	const identityLabel = allowUsername ? "login.username-or-email" : "email-address";

	return (
		<>
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
							<Field name="email" validate={validateString(1, 255)}>
								{({ field, form }: any) => (
									<label className="form-label">
										<T id={identityLabel} />
										<input
											{...field}
											ref={emailRef}
											type={allowUsername ? "text" : "email"}
											autoComplete="username"
											required
											maxLength={255}
											className={`form-control ${form.errors.email && form.touched.email ? " is-invalid" : ""}`}
											placeholder={intl.formatMessage({ id: identityLabel })}
										/>
										<div className="invalid-feedback">{form.errors.email}</div>
									</label>
								)}
							</Field>
						</div>
						<div className="mb-2">
							<Field name="password" validate={validateString(1, 255)}>
								{({ field, form }: any) => (
									<label className="form-label">
										<T id="password" />
										<input
											{...field}
											type="password"
											autoComplete="current-password"
											required
											maxLength={255}
											className={`form-control ${form.errors.password && form.touched.password ? " is-invalid" : ""}`}
											placeholder={intl.formatMessage({ id: "password" })}
										/>
										<div className="invalid-feedback">{form.errors.password}</div>
									</label>
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
		</>
	);
}

interface ProviderButtonsProps {
	providers: LoginProvider[];
}
function ProviderButtons({ providers }: ProviderButtonsProps) {
	return (
		<div className="d-grid gap-2">
			{providers.map((provider) => (
				<a key={provider.id} href={providerLoginUrl(provider.id)} className="btn btn-outline-azure w-100">
					{provider.type === "saml" ? (
						<IconShieldLock size={18} className="me-2" />
					) : (
						<IconKey size={18} className="me-2" />
					)}
					<T id="login.continue-with" data={{ name: provider.name }} />
				</a>
			))}
		</div>
	);
}

/**
 * Reads the result of a redirect based login out of the URL, then strips it
 * from the address bar so a refresh cannot try to reuse a spent code.
 */
const takeSsoResult = () => {
	const params = new URLSearchParams(window.location.search);
	const code = params.get("sso_code");
	const error = params.get("sso_error");

	if (code || error) {
		params.delete("sso_code");
		params.delete("sso_error");
		const query = params.toString();
		window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
	}

	return { code, error };
};

export default function Login() {
	const { twoFactorChallenge, loginWithSsoCode } = useAuthState();
	const health = useHealth();
	const loginOptions = useLoginOptions();
	const [ssoErr, setSsoErr] = useState("");
	const [exchanging, setExchanging] = useState(() => window.location.search.includes("sso_code="));

	// biome-ignore lint/correctness/useExhaustiveDependencies: only ever runs against the URL the page was opened with
	useEffect(() => {
		const { code, error } = takeSsoResult();

		if (error) {
			setSsoErr(error);
			return;
		}
		if (!code) {
			return;
		}

		loginWithSsoCode(code)
			.catch((err: Error) => setSsoErr(err.message))
			.finally(() => setExchanging(false));
	}, []);

	const getVersion = () => {
		if (!health.data) {
			return "";
		}
		const v = health.data.version;
		return `v${v.major}.${v.minor}.${v.revision}`;
	};

	// Until the options load, offer the password form: it is the only way in
	// if that endpoint is ever unreachable.
	const options: LoginOptions = loginOptions.data ?? {
		localEnabled: true,
		ldapEnabled: false,
		providers: [],
	};
	const showPasswordForm = options.localEnabled || options.ldapEnabled;
	const hasProviders = options.providers.length > 0;

	const renderBody = () => {
		if (twoFactorChallenge) {
			return <TwoFactorForm />;
		}

		if (exchanging) {
			return <Loading />;
		}

		return (
			<>
				<h2 className="h2 text-center mb-4">
					<T id="login.title" />
				</h2>
				{ssoErr !== "" && (
					<Alert variant="danger" dismissible onClose={() => setSsoErr("")}>
						{ssoErr}
					</Alert>
				)}
				{hasProviders ? <ProviderButtons providers={options.providers} /> : null}
				{hasProviders && showPasswordForm ? (
					<div className="hr-text text-secondary">
						<T id="login.or" />
					</div>
				) : null}
				{showPasswordForm ? <LoginForm allowUsername={options.ldapEnabled} /> : null}
				{!showPasswordForm && !hasProviders ? (
					<Alert variant="warning">
						<T id="login.no-methods" />
					</Alert>
				) : null}
			</>
		);
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
					<div className="d-flex align-items-center gap-1">
						<LocalePicker />
						<ThemeSwitcher />
					</div>
				</div>
				<div className="card card-md">
					<div className="card-body">{renderBody()}</div>
				</div>
				<div className="text-center text-secondary mt-3">{getVersion()}</div>
			</div>
		</Page>
	);
}
