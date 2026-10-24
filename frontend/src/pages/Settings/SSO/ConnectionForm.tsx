import { Form, Formik } from "formik";
import { useMemo, useState } from "react";
import type {
	SAMLConfig,
	SSOConfig,
	SSOConnection,
	SSOConnectionInput,
	SSOMetadataPreview,
	SSOProtocol,
	SSOSecretAction,
} from "src/api/backend";
import { Button } from "src/components";
import { intl, T } from "src/locale";

type Values = {
	protocol: SSOProtocol;
	name: string;
	enabled: boolean;
	secretAction: SSOSecretAction;
	secretValue: string;
	issuerUrl: string;
	authorizationUrl: string;
	tokenUrl: string;
	userinfoUrl: string;
	clientId: string;
	emailClaim: string;
	subjectClaim: string;
	nameClaim: string;
	scopes: string;
	useUserinfo: boolean;
	tokenAuthMethod: "client_secret_basic" | "client_secret_post";
	idpMetadataUrl: string;
	idpMetadataXml: string;
	spEntityId: string;
	emailAttribute: string;
	emailNameId: boolean;
	nameAttribute: string;
	signRequests: boolean;
};

const emptyValues = (connection?: SSOConnection): Values => {
	const config = (connection?.config || {}) as Record<string, any>;
	return {
		protocol: connection?.protocol || "oidc",
		name: connection?.name || "",
		enabled: connection?.enabled || false,
		secretAction: connection ? "keep" : "replace",
		secretValue: "",
		issuerUrl: config.issuerUrl || "",
		authorizationUrl: config.authorizationUrl || "",
		tokenUrl: config.tokenUrl || "",
		userinfoUrl: config.userinfoUrl || "",
		clientId: config.clientId || "",
		emailClaim: config.emailClaim || "email",
		subjectClaim: config.subjectClaim || "",
		nameClaim: config.nameClaim || "",
		scopes: (config.scopes || []).join(" "),
		useUserinfo: config.useUserinfo || false,
		tokenAuthMethod: config.tokenAuthMethod || "client_secret_basic",
		idpMetadataUrl: config.idpMetadataUrl || "",
		idpMetadataXml: config.idpMetadataXml || "",
		spEntityId: config.spEntityId || "",
		emailAttribute: config.emailAttribute || "",
		emailNameId: config.emailNameId || false,
		nameAttribute: config.nameAttribute || "",
		signRequests: config.signRequests || false,
	};
};

function optional(value: string): string | undefined {
	return value.trim() || undefined;
}

function configFrom(values: Values): SSOConfig {
	const scopes = values.scopes
		.split(/\s+/)
		.map((scope) => scope.trim())
		.filter(Boolean);
	if (values.protocol === "oidc") {
		return {
			issuerUrl: values.issuerUrl.trim(),
			clientId: values.clientId.trim(),
			emailClaim: values.emailClaim.trim(),
			nameClaim: optional(values.nameClaim),
			scopes,
			useUserinfo: values.useUserinfo,
			tokenAuthMethod: values.tokenAuthMethod,
		};
	}
	if (values.protocol === "oauth2") {
		return {
			authorizationUrl: values.authorizationUrl.trim(),
			tokenUrl: values.tokenUrl.trim(),
			userinfoUrl: values.userinfoUrl.trim(),
			clientId: values.clientId.trim(),
			emailClaim: values.emailClaim.trim(),
			subjectClaim: optional(values.subjectClaim),
			nameClaim: optional(values.nameClaim),
			scopes,
			tokenAuthMethod: values.tokenAuthMethod,
		};
	}
	return {
		idpMetadataUrl: optional(values.idpMetadataUrl),
		idpMetadataXml: optional(values.idpMetadataXml),
		spEntityId: values.spEntityId.trim(),
		emailAttribute: values.emailNameId ? undefined : optional(values.emailAttribute),
		emailNameId: values.emailNameId || undefined,
		nameAttribute: optional(values.nameAttribute),
		signRequests: values.signRequests,
	};
}

function required(values: Values): boolean {
	if (!values.name.trim()) return false;
	if (values.protocol === "oidc")
		return !!(values.issuerUrl.trim() && values.clientId.trim() && values.emailClaim.trim());
	if (values.protocol === "oauth2")
		return !!(
			values.authorizationUrl.trim() &&
			values.tokenUrl.trim() &&
			values.userinfoUrl.trim() &&
			values.clientId.trim() &&
			values.emailClaim.trim()
		);
	const oneMetadataSource = !!values.idpMetadataUrl.trim() !== !!values.idpMetadataXml.trim();
	const oneEmailSource = values.emailNameId !== !!values.emailAttribute.trim();
	return !!(oneMetadataSource && values.spEntityId.trim() && oneEmailSource);
}

const Field = ({
	id,
	label,
	type = "text",
	values,
	handleChange,
	required: isRequired = false,
	onSecurityChange,
}: any) => (
	<div className="mb-3">
		<div className="form-label">
			<T id={label} />
		</div>
		<input
			aria-label={intl.formatMessage({ id: label })}
			id={id}
			name={id}
			type={type}
			className="form-control"
			value={values[id]}
			required={isRequired}
			onChange={(event) => {
				handleChange(event);
				onSecurityChange?.();
			}}
		/>
	</div>
);

interface Props {
	connection?: SSOConnection;
	publicUrl: string;
	busy: boolean;
	onSave: (value: SSOConnectionInput) => Promise<boolean>;
	onDelete: (value: Pick<SSOConnection, "id" | "revision">) => Promise<void>;
	onTest: (id: string) => Promise<void>;
	onPreview: (config: SAMLConfig) => Promise<SSOMetadataPreview | undefined>;
}

export default function ConnectionForm({ connection, publicUrl, busy, onSave, onDelete, onTest, onPreview }: Props) {
	const [preview, setPreview] = useState<SSOMetadataPreview>();
	const [invalid, setInvalid] = useState<false | "fields" | "preview">(false);
	const initialValues = useMemo(() => emptyValues(connection), [connection]);
	const endpoint = connection ? `${publicUrl}/sso/${connection.id}` : "";

	return (
		<Formik
			initialValues={initialValues}
			enableReinitialize
			onSubmit={async (values) => {
				if (
					!required(values) ||
					(values.protocol !== "saml" && values.secretAction === "replace" && !values.secretValue)
				) {
					setInvalid("fields");
					return;
				}
				const nextConfig = configFrom(values);
				const originalConfig = configFrom(initialValues);
				const needsSAMLPreview =
					values.protocol === "saml" &&
					(!connection || JSON.stringify(nextConfig) !== JSON.stringify(originalConfig));
				if (needsSAMLPreview && !preview) {
					setInvalid("preview");
					return;
				}
				setInvalid(false);
				const input: SSOConnectionInput = {
					id: connection?.id,
					revision: connection?.revision,
					protocol: values.protocol,
					name: values.name.trim(),
					enabled: values.enabled,
					config: nextConfig,
					secretAction: values.protocol === "saml" ? (connection ? "keep" : "clear") : values.secretAction,
				};
				if (values.secretAction === "replace" && values.protocol !== "saml")
					input.secretValue = values.secretValue;
				if (preview?.importToken && values.protocol === "saml") input.samlImportToken = preview.importToken;
				if (await onSave(input)) setPreview(undefined);
			}}
		>
			{({ values, handleChange, setFieldValue }) => {
				const clearPreview = () => setPreview(undefined);
				return (
					<Form aria-label="SSO connection" className="border rounded p-3 mt-3">
						<div>
							{invalid && (
								<div className="alert alert-danger">
									<T
										id={
											invalid === "preview"
												? "settings.sso.previewRequired"
												: "settings.sso.invalidConnection"
										}
									/>
								</div>
							)}
							<div className="row">
								<div className="col-md-6">
									<Field
										id="name"
										label="settings.sso.name"
										values={values}
										handleChange={handleChange}
										required
									/>
								</div>
								<div className="col-md-6 mb-3">
									<div className="form-label">
										<T id="settings.sso.protocol" />
									</div>
									<select
										aria-label={intl.formatMessage({ id: "settings.sso.protocol" })}
										id="protocol"
										name="protocol"
										className="form-select"
										value={values.protocol}
										disabled={!!connection}
										onChange={(event) => {
											handleChange(event);
											setFieldValue("enabled", false);
											clearPreview();
										}}
									>
										<option value="oidc">OpenID Connect</option>
										<option value="oauth2">OAuth 2.0</option>
										<option value="saml">SAML 2.0</option>
									</select>
								</div>
							</div>
							<div className="form-check mb-3">
								<input
									aria-label={intl.formatMessage({ id: "settings.sso.enabled" })}
									id="sso-connection-enabled"
									name="enabled"
									type="checkbox"
									className="form-check-input"
									checked={values.enabled}
									onChange={handleChange}
								/>
								<label className="form-check-label" htmlFor="sso-connection-enabled">
									<T id="settings.sso.enabled" />
								</label>
							</div>

							{values.protocol === "oidc" && (
								<>
									<Field
										id="issuerUrl"
										label="settings.sso.issuerUrl"
										values={values}
										handleChange={handleChange}
										required
									/>
									<Field
										id="clientId"
										label="settings.sso.clientId"
										values={values}
										handleChange={handleChange}
										required
									/>
									<Field
										id="emailClaim"
										label="settings.sso.emailClaim"
										values={values}
										handleChange={handleChange}
										required
									/>
									<Field
										id="nameClaim"
										label="settings.sso.nameClaim"
										values={values}
										handleChange={handleChange}
									/>
									<div className="form-check mb-3">
										<input
											aria-label={intl.formatMessage({ id: "settings.sso.useUserinfo" })}
											name="useUserinfo"
											type="checkbox"
											className="form-check-input"
											checked={values.useUserinfo}
											onChange={handleChange}
										/>
										<span className="form-check-label">
											<T id="settings.sso.useUserinfo" />
										</span>
									</div>
								</>
							)}
							{values.protocol === "oauth2" && (
								<>
									<Field
										id="authorizationUrl"
										label="settings.sso.authorizationUrl"
										values={values}
										handleChange={handleChange}
										required
									/>
									<Field
										id="tokenUrl"
										label="settings.sso.tokenUrl"
										values={values}
										handleChange={handleChange}
										required
									/>
									<Field
										id="userinfoUrl"
										label="settings.sso.userinfoUrl"
										values={values}
										handleChange={handleChange}
										required
									/>
									<Field
										id="clientId"
										label="settings.sso.clientId"
										values={values}
										handleChange={handleChange}
										required
									/>
									<Field
										id="emailClaim"
										label="settings.sso.emailClaim"
										values={values}
										handleChange={handleChange}
										required
									/>
									<Field
										id="subjectClaim"
										label="settings.sso.subjectClaim"
										values={values}
										handleChange={handleChange}
									/>
									<Field
										id="nameClaim"
										label="settings.sso.nameClaim"
										values={values}
										handleChange={handleChange}
									/>
								</>
							)}
							{values.protocol !== "saml" && (
								<>
									<Field
										id="scopes"
										label="settings.sso.scopes"
										values={values}
										handleChange={handleChange}
									/>
									<div className="mb-3">
										<div className="form-label">
											<T id="settings.sso.tokenAuthMethod" />
										</div>
										<select
											aria-label={intl.formatMessage({ id: "settings.sso.tokenAuthMethod" })}
											id="tokenAuthMethod"
											name="tokenAuthMethod"
											className="form-select"
											value={values.tokenAuthMethod}
											onChange={handleChange}
										>
											<option value="client_secret_basic">client_secret_basic</option>
											<option value="client_secret_post">client_secret_post</option>
										</select>
									</div>
									{connection?.hasSecret && (
										<p className="text-secondary">
											<T id="settings.sso.secretConfigured" />
										</p>
									)}
									<div className="mb-3">
										{connection && (
											<div className="form-check">
												<input
													aria-label={intl.formatMessage({ id: "settings.sso.secretKeep" })}
													type="radio"
													name="secretAction"
													value="keep"
													checked={values.secretAction === "keep"}
													onChange={handleChange}
													className="form-check-input"
												/>
												<span className="form-check-label">
													<T id="settings.sso.secretKeep" />
												</span>
											</div>
										)}
										<div className="form-check">
											<input
												aria-label={intl.formatMessage({ id: "settings.sso.secretReplace" })}
												type="radio"
												name="secretAction"
												value="replace"
												checked={values.secretAction === "replace"}
												onChange={handleChange}
												className="form-check-input"
											/>
											<span className="form-check-label">
												<T id="settings.sso.secretReplace" />
											</span>
										</div>
										<div className="form-check">
											<input
												aria-label={intl.formatMessage({ id: "settings.sso.secretClear" })}
												type="radio"
												name="secretAction"
												value="clear"
												checked={values.secretAction === "clear"}
												onChange={handleChange}
												className="form-check-input"
											/>
											<span className="form-check-label">
												<T id="settings.sso.secretClear" />
											</span>
										</div>
									</div>
									{values.secretAction === "replace" && (
										<Field
											id="secretValue"
											label="settings.sso.clientSecret"
											type="password"
											values={values}
											handleChange={handleChange}
											required
										/>
									)}
								</>
							)}

							{values.protocol === "saml" && (
								<>
									<Field
										id="idpMetadataUrl"
										label="settings.sso.idpMetadataUrl"
										values={values}
										handleChange={handleChange}
										onSecurityChange={clearPreview}
									/>
									<div className="mb-3">
										<div className="form-label">
											<T id="settings.sso.idpMetadataXml" />
										</div>
										<textarea
											aria-label={intl.formatMessage({ id: "settings.sso.idpMetadataXml" })}
											id="idpMetadataXml"
											name="idpMetadataXml"
											rows={5}
											className="form-control"
											value={values.idpMetadataXml}
											onChange={(event) => {
												handleChange(event);
												clearPreview();
											}}
										/>
									</div>
									<Field
										id="spEntityId"
										label="settings.sso.spEntityId"
										values={values}
										handleChange={handleChange}
										onSecurityChange={clearPreview}
										required
									/>
									<Field
										id="emailAttribute"
										label="settings.sso.emailAttribute"
										values={values}
										handleChange={handleChange}
										onSecurityChange={clearPreview}
									/>
									<div className="form-check mb-3">
										<input
											aria-label={intl.formatMessage({ id: "settings.sso.emailNameId" })}
											name="emailNameId"
											type="checkbox"
											className="form-check-input"
											checked={values.emailNameId}
											onChange={(event) => {
												handleChange(event);
												clearPreview();
											}}
										/>
										<span className="form-check-label">
											<T id="settings.sso.emailNameId" />
										</span>
									</div>
									<Field
										id="nameAttribute"
										label="settings.sso.nameAttribute"
										values={values}
										handleChange={handleChange}
										onSecurityChange={clearPreview}
									/>
									<div className="form-check mb-3">
										<input
											aria-label={intl.formatMessage({ id: "settings.sso.signRequests" })}
											name="signRequests"
											type="checkbox"
											className="form-check-input"
											checked={values.signRequests}
											onChange={(event) => {
												handleChange(event);
												clearPreview();
											}}
										/>
										<span className="form-check-label">
											<T id="settings.sso.signRequests" />
										</span>
									</div>
									<Button
										onClick={async () => {
											const nextPreview = await onPreview(configFrom(values) as SAMLConfig);
											if (nextPreview) setPreview(nextPreview);
										}}
										disabled={busy || !required(values)}
									>
										<T id="settings.sso.preview" />
									</Button>
									{preview && (
										<div className="alert alert-info mt-3">
											<strong>
												<T id="settings.sso.metadataReviewed" />
											</strong>
											<div>{preview.entityId}</div>
											<div>{preview.ssoUrl}</div>
											<div>
												<T id="settings.sso.effectiveSigning" />:{" "}
												<strong>
													<T
														id={
															preview.signRequests
																? "settings.sso.signingRequired"
																: "settings.sso.signingNotRequired"
														}
													/>
												</strong>
											</div>
											{preview.certificateFingerprints.map((value) => (
												<code className="d-block" key={value}>
													{value}
												</code>
											))}
											{preview.spCertificate && (
												<>
													<div>
														<T id="settings.sso.publicCertificate" />
													</div>
													<pre>{preview.spCertificate}</pre>
												</>
											)}
										</div>
									)}
								</>
							)}

							{endpoint && (
								<div className="mt-3 text-secondary">
									{values.protocol === "saml" ? (
										<>
											<div>
												<T id="settings.sso.acsUrl" />: <code>{endpoint}/acs</code>
											</div>
											<div>
												<T id="settings.sso.metadataUrl" />: <code>{endpoint}/metadata</code>
											</div>
										</>
									) : (
										<div>
											<T id="settings.sso.callbackUrl" />: <code>{endpoint}/callback</code>
										</div>
									)}
								</div>
							)}
						</div>
						<div className="d-flex gap-2 justify-content-end mt-3">
							{connection && (
								<Button
									actionType="danger"
									onClick={() => onDelete({ id: connection.id, revision: connection.revision })}
									disabled={busy}
								>
									<T id="settings.sso.delete" />
								</Button>
							)}
							<Button onClick={() => connection && onTest(connection.id)} disabled={busy || !connection}>
								<T id="settings.sso.test" />
							</Button>
							<Button type="submit" actionType="primary" disabled={busy} isLoading={busy}>
								<T id="settings.sso.save" />
							</Button>
						</div>
					</Form>
				);
			}}
		</Formik>
	);
}
