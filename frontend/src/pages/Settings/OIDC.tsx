import { useEffect, useState } from "react";
import { Formik, Form, Field } from "formik";
import { Alert } from "react-bootstrap";
import { Button, Loading } from "src/components";
import { oidcRequest, type OIDCSettings } from "src/api/backend/oidc";
import { T, intl } from "src/locale";

export default function OIDC() {
	const [data, setData] = useState<OIDCSettings>();
	const [error, setError] = useState("");
	const [saved, setSaved] = useState(false);
	useEffect(() => {
		oidcRequest<OIDCSettings>("settings")
			.then((v) => setData({ ...v, clientSecret: "", publicUrl: v.publicUrl || window.location.origin }))
			.catch((e) => setError(e.message));
	}, []);
	if (!data)
		return <div className="card-body">{error ? <Alert variant="danger">{error}</Alert> : <Loading noLogo />}</div>;
	return (
		<Formik
			initialValues={data}
			enableReinitialize
			onSubmit={async (values, { setSubmitting }) => {
				setError("");
				setSaved(false);
				try {
					const result = await oidcRequest<OIDCSettings>("settings", "PUT", values);
					setData({ ...result, clientSecret: "" });
					setSaved(true);
				} catch (e) {
					setError((e as Error).message);
				} finally {
					setSubmitting(false);
				}
			}}
		>
			{({ isSubmitting, values }) => (
				<Form>
					<div className="card-body">
						<h3 className="card-title">
							<T id="oidc.title" />
						</h3>
						<p className="text-secondary">
							<T id="oidc.description" />
						</p>
						{error && <Alert variant="danger">{error}</Alert>}
						{saved && (
							<Alert variant="success">
								<T id="oidc.saved" />
							</Alert>
						)}
						<fieldset disabled={isSubmitting}>
							<label className="form-check mb-3" htmlFor="oidc-enabled">
								<Field id="oidc-enabled" type="checkbox" name="enabled" className="form-check-input" />
								<span className="form-check-label">
									<T id="oidc.enabled" />
								</span>
							</label>
							{(
								[
									["issuer", "oidc.issuer", "url"],
									["clientId", "oidc.client-id", "text"],
									["clientSecret", "oidc.client-secret", "password"],
									["publicUrl", "oidc.public-url", "url"],
								] as const
							).map(([name, label, type]) => (
								<div className="mb-3" key={name}>
									<label className="form-label" htmlFor={name}>
										<T id={label} />
									</label>
									<Field
										id={name}
										type={type}
										name={name}
										className="form-control"
										autoComplete={type === "password" ? "new-password" : "off"}
										required={values.enabled && name !== "clientSecret"}
									/>
									{name === "clientSecret" && (
										<small className="form-hint">
											<T
												id={
													data.clientSecretConfigured ? "oidc.secret-kept" : "oidc.secret-new"
												}
											/>
										</small>
									)}
								</div>
							))}
							<div className="mb-3">
								<div className="form-label">
									<T id="oidc.callback" />
								</div>
								<code>{values.publicUrl.replace(/\/$/, "")}/api/oidc/callback</code>
							</div>
							<details className="mb-3">
								<summary className="text-secondary">
									<T id="oidc.advanced" />
								</summary>
								<label className="form-label mt-3" htmlFor="scopes">
									Scopes
								</label>
								<Field id="scopes" name="scopes" className="form-control mb-3" />
								<label className="form-label" htmlFor="tokenAuthMethod">
									<T id="oidc.token-auth" />
								</label>
								<Field
									as="select"
									id="tokenAuthMethod"
									name="tokenAuthMethod"
									className="form-select mb-3"
								>
									<option value="auto">Auto</option>
									<option value="client_secret_basic">client_secret_basic</option>
									<option value="client_secret_post">client_secret_post</option>
								</Field>
								<label className="form-check" htmlFor="oidc-auto-login">
									<Field
										id="oidc-auto-login"
										type="checkbox"
										name="autoLogin"
										className="form-check-input"
									/>
									<span className="form-check-label">
										<T id="oidc.auto-login" />
									</span>
								</label>
							</details>
						</fieldset>
					</div>
					<div className="card-footer bg-transparent">
						<div className="btn-list justify-content-end">
							<Button
								type="submit"
								className="bg-teal"
								actionType="primary"
								disabled={isSubmitting}
								isLoading={isSubmitting}
							>
								{intl.formatMessage({ id: "save" })}
							</Button>
						</div>
					</div>
				</Form>
			)}
		</Formik>
	);
}
