import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { useEffect, useState } from "react";
import { Formik, Form, Field } from "formik";
import { Alert, Modal } from "react-bootstrap";
import { Button } from "src/components";
import { oidcRequest } from "src/api/backend/oidc";
import { T } from "src/locale";

const OIDCLinkModal = EasyModal.create(({ visible, remove }: InnerModalProps) => {
	const [identity, setIdentity] = useState<{ linked: boolean; issuer: string }>();
	const [error, setError] = useState("");
	useEffect(() => {
		oidcRequest<{ linked: boolean; issuer: string }>("identity")
			.then(setIdentity)
			.catch((e) => setError(e.message));
	}, []);
	return (
		<Modal show={visible} onHide={remove}>
			<Formik
				initialValues={{ password: "", code: "" }}
				onSubmit={async (values, { setSubmitting }) => {
					setError("");
					try {
						if (identity?.linked) {
							await oidcRequest("unlink", "POST", values);
							remove();
						} else {
							const result = await oidcRequest<{ url: string }>("link", "POST", values);
							window.location.assign(result.url);
						}
					} catch (e) {
						setError((e as Error).message);
						setSubmitting(false);
					}
				}}
			>
				{({ isSubmitting }) => (
					<Form>
						<Modal.Header closeButton>
							<Modal.Title>
								<T id="oidc.link-title" />
							</Modal.Title>
						</Modal.Header>
						<Modal.Body>
							{error && <Alert variant="danger">{error}</Alert>}
							<p>
								<T id={identity?.linked ? "oidc.linked" : "oidc.link-description"} />
							</p>
							{identity?.linked && <code>{identity.issuer}</code>}
							<fieldset disabled={isSubmitting}>
								<label className="form-label mt-3" htmlFor="oidc-password">
									<T id="user.current-password" />
								</label>
								<Field
									id="oidc-password"
									name="password"
									type="password"
									autoComplete="current-password"
									className="form-control mb-3"
									required
								/>
								<label className="form-label" htmlFor="oidc-totp">
									<T id="oidc.totp" />
								</label>
								<Field
									id="oidc-totp"
									name="code"
									autoComplete="one-time-code"
									className="form-control"
								/>
							</fieldset>
						</Modal.Body>
						<Modal.Footer>
							<Button type="button" onClick={remove} disabled={isSubmitting}>
								<T id="cancel" />
							</Button>
							<Button
								type="submit"
								actionType="primary"
								disabled={isSubmitting || !identity}
								isLoading={isSubmitting}
							>
								<T id={identity?.linked ? "oidc.unlink" : "oidc.link"} />
							</Button>
						</Modal.Footer>
					</Form>
				)}
			</Formik>
		</Modal>
	);
});
export const showOIDCLinkModal = () => EasyModal.show(OIDCLinkModal, {});
