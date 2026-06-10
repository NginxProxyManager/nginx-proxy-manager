import {
	IconAlertTriangle,
	IconCheck,
	IconLock,
	IconLockOpen2,
	IconPlugConnected,
} from "@tabler/icons-react";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { testOidcConnection } from "src/api/backend";
import type { OidcProviderConfig, TestOidcConnectionResult } from "src/api/backend";
import { Button } from "src/components";
import { useSetOidcConfig } from "src/hooks";
import { intl, T } from "src/locale";
import { showError, showObjectSuccess } from "src/notifications";

const slugify = (s: string) =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");

interface ShowProps {
	provider: OidcProviderConfig;
	isNew: boolean;
	allProviders: OidcProviderConfig[];
}

interface Props extends InnerModalProps, ShowProps {}

const OidcProviderModal = EasyModal.create(({ provider, isNew, allProviders, visible, remove }: Props) => {
	// File-sourced providers are read-only — the modal should never open for them
	// (OidcSettings guards this), but we add a safety check here as defence-in-depth.
	const isReadOnly = provider.source === "file";

	const { mutate: setOidcConfig } = useSetOidcConfig();
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Auto-ID: new providers start with auto-gen enabled; existing providers start locked
	const [isAutoId, setIsAutoId] = useState(isNew);
	const [idValue, setIdValue] = useState(provider.id);

	// Test connection state
	const [isTesting, setIsTesting] = useState(false);
	const [testResult, setTestResult] = useState<TestOidcConnectionResult | "error" | null>(null);

	const onSubmit = (values: OidcProviderConfig) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		const cloned = [...allProviders];

		if (isNew) {
			cloned.push(values);
		} else {
			const resolvedIndex = cloned.findIndex((p) => p.id === provider.id);
			if (resolvedIndex === -1) {
				setErrorMsg("Provider no longer exists. Please close and retry.");
				setIsSubmitting(false);
				return;
			}
			cloned[resolvedIndex] = values;
		}

		setOidcConfig(
			{ providers: cloned },
			{
				onError: (err: any) => {
					showError(err.message);
					setErrorMsg(err.message);
					setIsSubmitting(false);
				},
				onSuccess: () => {
					showObjectSuccess("setting", "saved");
					setIsSubmitting(false);
					remove();
				},
			},
		);
	};

	return (
		<Modal show={visible} onHide={remove} size="lg">
			<Formik
				initialValues={{ ...provider }}
				onSubmit={onSubmit}
				enableReinitialize={false}
			>
				{({ values, setFieldValue }) => (
					<Form>
						<Modal.Header closeButton>
							<Modal.Title>
								<T
									id={isNew ? "object.add" : "object.edit"}
									tData={{ object: intl.formatMessage({ id: "column.provider" }) }}
								/>
							</Modal.Title>
						</Modal.Header>
						<Modal.Body className="p-0">
							<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible className="m-3 mb-0">
								{errorMsg}
							</Alert>
							<div className="card m-0 border-0">
								<div className="card-header">
									<ul className="nav nav-tabs card-header-tabs" data-bs-toggle="tabs">
										<li className="nav-item" role="presentation">
											<a
												href="#tab-connection"
												className="nav-link active"
												data-bs-toggle="tab"
												aria-selected="true"
												role="tab"
											>
												<T id="settings.oidc.section.connection" />
											</a>
										</li>
										<li className="nav-item" role="presentation">
											<a
												href="#tab-options"
												className="nav-link"
												data-bs-toggle="tab"
												aria-selected="false"
												tabIndex={-1}
												role="tab"
											>
												<T id="options" />
											</a>
										</li>
										<li className="nav-item" role="presentation">
											<a
												href="#tab-claims"
												className="nav-link"
												data-bs-toggle="tab"
												aria-selected="false"
												tabIndex={-1}
												role="tab"
											>
												<T id="settings.oidc.section.claim-mapping" />
											</a>
										</li>
									</ul>
								</div>
								<div className="card-body">
									<div className="tab-content">
										{/* ── Connection tab ── */}
										<div className="tab-pane active show" id="tab-connection" role="tabpanel">
											<div className="row g-3">
												{/* Provider Name */}
												<div className="col-md-6">
													<label htmlFor="oidc-provider-name" className="form-label">
														<T id="settings.oidc.provider-name" />
													</label>
													<Field name="name">
														{({ field }: any) => (
															<input
																{...field}
																id="oidc-provider-name"
																type="text"
																className="form-control"
																placeholder="Authentik"
																required
																onChange={(e) => {
																	const newName = e.target.value;
																	setFieldValue("name", newName);
																	if (isAutoId) {
																		const slug = slugify(newName);
																		setFieldValue("id", slug);
																		setIdValue(slug);
																	}
																}}
															/>
														)}
													</Field>
												</div>

												{/* Provider ID */}
												<div className="col-md-6">
													<label htmlFor="oidc-provider-id" className="form-label">
														<T id="settings.oidc.provider-id" />
													</label>
													<div className="input-group">
														<Field name="id">
															{({ field }: any) => (
																<input
																	{...field}
																	id="oidc-provider-id"
																	type="text"
																	className="form-control"
																	placeholder="authentik"
																	required
																	value={idValue}
																	onChange={(e) => {
																		const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
																		setIsAutoId(false);
																		setIdValue(val);
																		setFieldValue("id", val);
																	}}
																/>
															)}
														</Field>
														<button
															type="button"
															className={isAutoId ? "btn btn-outline-secondary" : "btn btn-outline-primary"}
															title={
																isAutoId
																	? intl.formatMessage({ id: "settings.oidc.provider-id.auto" })
																	: intl.formatMessage({ id: "settings.oidc.provider-id.reset" })
															}
															onClick={() => {
																if (!isAutoId) {
																	setIsAutoId(true);
																	const slug = slugify(values.name);
																	setFieldValue("id", slug);
																	setIdValue(slug);
																}
															}}
														>
															{isAutoId ? (
																<IconLock size={16} className="text-muted" />
															) : (
																<IconLockOpen2 size={16} />
															)}
														</button>
													</div>
													{isAutoId && (
														<small className="text-secondary">
															<T id="settings.oidc.provider-id.auto" />
														</small>
													)}
												</div>

												{/* Discovery URL */}
												<div className="col-12">
													<label htmlFor="oidc-discovery-url" className="form-label">
														<T id="settings.oidc.discovery-url" />
													</label>
													<Field name="discoveryUrl">
														{({ field }: any) => (
															<>
																<input
																	{...field}
																	id="oidc-discovery-url"
																	type="url"
																	className={`form-control ${
																		field.value && !field.value.startsWith("https://") ? "is-invalid" : ""
																	}`}
																	placeholder={intl.formatMessage({ id: "settings.oidc.discovery-url.placeholder" })}
																	required
																/>
																{field.value && !field.value.startsWith("https://") && (
																	<div className="invalid-feedback">
																		<T id="settings.oidc.discovery-url.https-required" />
																	</div>
																)}
															</>
														)}
													</Field>
												</div>

												{/* Client ID */}
												<div className="col-md-6">
													<label htmlFor="oidc-client-id" className="form-label">
														<T id="settings.oidc.client-id" />
													</label>
													<Field name="clientId">
														{({ field }: any) => (
															<input {...field} id="oidc-client-id" type="text" className="form-control" required />
														)}
													</Field>
												</div>

												{/* Client Secret */}
												<div className="col-md-6">
													<label htmlFor="oidc-client-secret" className="form-label">
														<T id="settings.oidc.client-secret" />
													</label>
													<Field name="clientSecret">
														{({ field }: any) => (
															<input
																{...field}
																id="oidc-client-secret"
																type="password"
																className="form-control"
																autoComplete="new-password"
															/>
														)}
													</Field>
												</div>
												{/* Scopes */}
												<div className="col-md-6">
													<label htmlFor="oidc-scopes" className="form-label">
														<T id="settings.oidc.scopes" />
													</label>
													<Field name="scopes">
														{({ field }: any) => (
															<input
																{...field}
																id="oidc-scopes"
																type="text"
																className="form-control"
																placeholder="openid email profile"
															/>
														)}
													</Field>
												</div>
											</div>

											{/* Test Connection */}
											<div className="d-flex align-items-start gap-2 mt-4 pt-3 border-top">
												<Button
													type="button"
													actionType="light"
													size="sm"
													isLoading={isTesting}
													disabled={!values.discoveryUrl || !values.clientId || isTesting}
													onClick={() => {
														setIsTesting(true);
														setTestResult(null);
														testOidcConnection({
															discoveryUrl: values.discoveryUrl,
															clientId: values.clientId,
															clientSecret: values.clientSecret,
															scopes: values.scopes || "openid email profile",
															providerId: values.id || undefined,
														})
															.then((result) => setTestResult(result))
															.catch(() => setTestResult("error"))
															.finally(() => setIsTesting(false));
													}}
												>
													<IconPlugConnected size={16} className="me-1" />
													<T id="settings.oidc.test-connection" />
												</Button>
												{testResult && testResult !== "error" && (
													<div className="small">
														<div className="text-success">
															<IconCheck size={16} className="me-1" />
															<T id="settings.oidc.test-connection.discovery-ok" />
														</div>
														{testResult.credentials === "valid" && (
															<div className="text-success">
																<IconCheck size={16} className="me-1" />
																<T id="settings.oidc.test-connection.credentials-ok" />
															</div>
														)}
														{testResult.credentials === "invalid" && (
															<div className="text-danger">
																<IconAlertTriangle size={16} className="me-1" />
																<T id="settings.oidc.test-connection.credentials-invalid" />
																{testResult.credentialsMessage && (
																	<div className="text-secondary ms-3">{testResult.credentialsMessage}</div>
																)}
															</div>
														)}
														{testResult.credentials === "unsupported" && (
															<div className="text-warning">
																<IconAlertTriangle size={16} className="me-1" />
																<T id="settings.oidc.test-connection.credentials-unsupported" />
															</div>
														)}
														{testResult.scopesValid === true && (
															<div className="text-success">
																<IconCheck size={16} className="me-1" />
																<T id="settings.oidc.test-connection.scopes-ok" />
															</div>
														)}
														{testResult.scopesValid === false && (
															<div className="text-danger">
																<IconAlertTriangle size={16} className="me-1" />
																<T id="settings.oidc.test-connection.scopes-invalid" />
																{testResult.unsupportedScopes?.length > 0 && (
																	<div className="text-secondary ms-3">
																		<code>{testResult.unsupportedScopes.join(", ")}</code>
																	</div>
																)}
															</div>
														)}
													</div>
												)}
												{testResult === "error" && (
													<span className="text-danger small">
														<T id="settings.oidc.test-connection.error" />
													</span>
												)}
											</div>
										</div>

										{/* ── Options tab ── */}
										<div className="tab-pane" id="tab-options" role="tabpanel">
											<div className="row g-3">
												{/* Auto-provision */}
												<div className="col-md-6">
													<label htmlFor="oidc-auto-provision" className="form-label d-block">
														<T id="settings.oidc.auto-provision" />
													</label>
													<Field name="autoProvision">
														{({ field }: any) => (
															<label className="form-check form-switch">
																<input
																	{...field}
																	id="oidc-auto-provision"
																	type="checkbox"
																	className="form-check-input"
																	checked={field.value}
																/>
																<span className="form-check-label text-secondary small">
																	<T id="settings.oidc.auto-provision.description" />
																</span>
															</label>
														)}
													</Field>
													{values.autoProvision && (
														<small className="text-secondary d-block mt-2">
															<T id="settings.oidc.auto-provision.note" />
														</small>
													)}
												</div>

												{/* PAR */}
												<div className="col-md-6">
													<label htmlFor="oidc-use-par" className="form-label d-block">
														<T id="settings.oidc.use-par" />
													</label>
													<Field name="usePar">
														{({ field }: any) => (
															<label className="form-check form-switch">
																<input
																	{...field}
																	id="oidc-use-par"
																	type="checkbox"
																	className="form-check-input"
																	checked={field.value}
																/>
																<span className="form-check-label text-secondary small">
																	<T id="settings.oidc.use-par.description" />
																</span>
															</label>
														)}
													</Field>
												</div>
											</div>
										</div>

										{/* ── Claim Mapping tab ── */}
										<div className="tab-pane" id="tab-claims" role="tabpanel">
											<small className="text-secondary d-block mb-3">
												<T id="settings.oidc.claim-mapping.description" />
											</small>
											<div className="row g-3">
												<div className="col-md-6">
													<label htmlFor="oidc-claim-email" className="form-label">
														<T id="settings.oidc.claim-mapping.email" />
													</label>
													<Field name="claimMapping.email">
														{({ field }: any) => (
															<input
																{...field}
																id="oidc-claim-email"
																type="text"
																className="form-control"
																placeholder="email"
																value={field.value ?? "email"}
															/>
														)}
													</Field>
												</div>
												<div className="col-md-6">
													<label htmlFor="oidc-claim-name" className="form-label">
														<T id="settings.oidc.claim-mapping.name" />
													</label>
													<Field name="claimMapping.name">
														{({ field }: any) => (
															<input
																{...field}
																id="oidc-claim-name"
																type="text"
																className="form-control"
																placeholder="name"
																value={field.value ?? "name"}
															/>
														)}
													</Field>
												</div>
												<div className="col-md-6">
													<label htmlFor="oidc-claim-nickname" className="form-label">
														<T id="settings.oidc.claim-mapping.nickname" />
													</label>
													<Field name="claimMapping.nickname">
														{({ field }: any) => (
															<input
																{...field}
																id="oidc-claim-nickname"
																type="text"
																className="form-control"
																placeholder="preferred_username"
																value={field.value ?? "preferred_username"}
															/>
														)}
													</Field>
												</div>
												<div className="col-md-6">
													<label htmlFor="oidc-claim-avatar" className="form-label">
														<T id="settings.oidc.claim-mapping.avatar" />
													</label>
													<Field name="claimMapping.avatar">
														{({ field }: any) => (
															<input
																{...field}
																id="oidc-claim-avatar"
																type="text"
																className="form-control"
																placeholder="picture"
																value={field.value ?? "picture"}
															/>
														)}
													</Field>
												</div>
											</div>
										</div>
									</div>
								</div>
							</div>
						</Modal.Body>
						<Modal.Footer>
							<Button data-bs-dismiss="modal" onClick={remove} disabled={isSubmitting}>
								<T id="cancel" />
							</Button>
							{!isReadOnly && (
								<Button
									type="submit"
									className="ms-2 btn-teal"
									isLoading={isSubmitting}
									disabled={isSubmitting}
								>
									<T id="save" />
								</Button>
							)}
						</Modal.Footer>
					</Form>
				)}
			</Formik>
		</Modal>
	);
});

const showOidcProviderModal = (props: ShowProps) => {
	EasyModal.show(OidcProviderModal, props);
};

export { showOidcProviderModal };
