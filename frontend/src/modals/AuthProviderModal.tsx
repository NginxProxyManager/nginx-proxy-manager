import { useQueryClient } from "@tanstack/react-query";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import {
	type AuthProvider,
	type AuthProviderType,
	createAuthProvider,
	providerMetadataUrl,
	updateAuthProvider,
} from "src/api/backend";
import { Button } from "src/components";
import { intl, T } from "src/locale";
import { validateString } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";
import styles from "./AuthProviderModal.module.css";

const showAuthProviderModal = (provider: AuthProvider | AuthProviderType) => {
	EasyModal.show(AuthProviderModal, { provider });
};

interface TextFieldProps {
	name: string;
	label: string;
	help?: ReactNode;
	type?: string;
	placeholder?: string;
	required?: boolean;
	rows?: number;
	disabled?: boolean;
}
function TextField({ name, label, help, type, placeholder, required, rows, disabled }: TextFieldProps) {
	return (
		<Field name={name} validate={required ? validateString(1, 4096) : undefined}>
			{({ field, form }: any) => {
				const invalid = form.errors[name] && form.touched[name];
				return (
					<div className="mb-3">
						<label htmlFor={name} className="form-label">
							<T id={label} />
						</label>
						{rows ? (
							<textarea
								id={name}
								rows={rows}
								disabled={disabled}
								className={`form-control ${invalid ? "is-invalid" : ""}`}
								placeholder={placeholder}
								{...field}
							/>
						) : (
							<input
								id={name}
								type={type || "text"}
								disabled={disabled}
								autoComplete={type === "password" ? "new-password" : "off"}
								className={`form-control ${invalid ? "is-invalid" : ""}`}
								placeholder={placeholder}
								{...field}
							/>
						)}
						{invalid ? <div className="invalid-feedback">{form.errors[name]}</div> : null}
						{help ? <small className="form-hint">{help}</small> : null}
					</div>
				);
			}}
		</Field>
	);
}

interface CheckFieldProps {
	name: string;
	label: string;
	help?: ReactNode;
	disabled?: boolean;
}
function CheckField({ name, label, help, disabled }: CheckFieldProps) {
	return (
		<Field name={name}>
			{({ field, form }: any) => (
				<div className="mb-3">
					<label className="form-check form-switch">
						<input
							type="checkbox"
							className="form-check-input"
							disabled={disabled}
							checked={!!field.value}
							onChange={() => form.setFieldValue(name, !field.value)}
						/>
						<span className="form-check-label">
							<T id={label} />
						</span>
					</label>
					{help ? <small className="form-hint">{help}</small> : null}
				</div>
			)}
		</Field>
	);
}

/** A note explaining that a stored secret is kept when the field is left blank */
function SecretHint({ isSet }: { isSet?: boolean }) {
	return isSet ? <T id="auth-provider.secret-stored" /> : null;
}

interface FieldsProps {
	provider?: AuthProvider;
	disabled?: boolean;
}

function LdapFields({ provider, disabled }: FieldsProps) {
	return (
		<>
			<TextField
				name="meta.url"
				label="auth-provider.ldap.url"
				placeholder="ldaps://ldap.example.com:636"
				required
				disabled={disabled}
			/>
			<TextField
				name="meta.baseDn"
				label="auth-provider.ldap.base-dn"
				placeholder="dc=example,dc=com"
				required
				disabled={disabled}
			/>
			<TextField
				name="meta.bindDn"
				label="auth-provider.ldap.bind-dn"
				placeholder="cn=readonly,dc=example,dc=com"
				help={<T id="auth-provider.ldap.bind-dn-help" />}
				disabled={disabled}
			/>
			<TextField
				name="meta.bindPassword"
				label="auth-provider.ldap.bind-password"
				type="password"
				help={<SecretHint isSet={provider?.meta?.bindPasswordSet} />}
				disabled={disabled}
			/>
			<TextField
				name="meta.userFilter"
				label="auth-provider.ldap.user-filter"
				placeholder="(|(uid={{username}})(mail={{username}}))"
				help={<T id="auth-provider.ldap.user-filter-help" />}
				disabled={disabled}
			/>
			<div className="row">
				<div className="col-md-4">
					<TextField
						name="meta.emailAttribute"
						label="auth-provider.ldap.email-attribute"
						placeholder="mail"
						disabled={disabled}
					/>
				</div>
				<div className="col-md-4">
					<TextField
						name="meta.nameAttribute"
						label="auth-provider.ldap.name-attribute"
						placeholder="cn"
						disabled={disabled}
					/>
				</div>
				<div className="col-md-4">
					<TextField
						name="meta.nicknameAttribute"
						label="auth-provider.ldap.nickname-attribute"
						placeholder="givenName"
						disabled={disabled}
					/>
				</div>
			</div>
			<TextField
				name="meta.groupAttribute"
				label="auth-provider.ldap.group-attribute"
				placeholder="memberOf"
				help={<T id="auth-provider.ldap.group-attribute-help" />}
				disabled={disabled}
			/>
			<TextField
				name="meta.groupFilter"
				label="auth-provider.ldap.group-filter"
				placeholder="(&(objectClass=groupOfNames)(member={{dn}}))"
				help={<T id="auth-provider.ldap.group-filter-help" />}
				disabled={disabled}
			/>
			<TextField
				name="meta.loginAttributes"
				label="auth-provider.ldap.login-attributes"
				placeholder="uid, mail, sAMAccountName"
				help={<T id="auth-provider.ldap.login-attributes-help" />}
				disabled={disabled}
			/>
			<TextField
				name="meta.pageSize"
				label="auth-provider.ldap.page-size"
				type="number"
				help={<T id="auth-provider.ldap.page-size-help" />}
				disabled={disabled}
			/>
			<CheckField name="meta.startTls" label="auth-provider.ldap.start-tls" disabled={disabled} />
			<CheckField
				name="meta.tlsRejectUnauthorized"
				label="auth-provider.ldap.verify-tls"
				help={<T id="auth-provider.ldap.verify-tls-help" />}
				disabled={disabled}
			/>
		</>
	);
}

function SamlFields({ provider, disabled }: FieldsProps) {
	return (
		<>
			{provider ? (
				<div className="mb-3">
					<div className="form-label">
						<T id="auth-provider.saml.metadata" />
					</div>
					<div>
						<a href={providerMetadataUrl(provider.id)} target="_blank" rel="noreferrer">
							{providerMetadataUrl(provider.id)}
						</a>
					</div>
					<small className="form-hint">
						<T id="auth-provider.saml.metadata-help" />
					</small>
				</div>
			) : null}
			<TextField
				name="meta.entryPoint"
				label="auth-provider.saml.entry-point"
				placeholder="https://idp.example.com/sso/saml"
				required
				disabled={disabled}
			/>
			<TextField
				name="meta.issuer"
				label="auth-provider.saml.issuer"
				placeholder="nginx-proxy-manager"
				help={<T id="auth-provider.saml.issuer-help" />}
				disabled={disabled}
			/>
			<TextField
				name="meta.idpCert"
				label="auth-provider.saml.idp-cert"
				rows={5}
				placeholder="-----BEGIN CERTIFICATE-----"
				required
				disabled={disabled}
			/>
			<div className="row">
				<div className="col-md-4">
					<TextField
						name="meta.emailAttribute"
						label="auth-provider.saml.email-attribute"
						disabled={disabled}
					/>
				</div>
				<div className="col-md-4">
					<TextField
						name="meta.nameAttribute"
						label="auth-provider.saml.name-attribute"
						disabled={disabled}
					/>
				</div>
				<div className="col-md-4">
					<TextField
						name="meta.groupAttribute"
						label="auth-provider.saml.group-attribute"
						disabled={disabled}
					/>
				</div>
			</div>
			<CheckField
				name="meta.wantAssertionsSigned"
				label="auth-provider.saml.want-assertions-signed"
				disabled={disabled}
			/>
			<CheckField
				name="meta.wantAuthnResponseSigned"
				label="auth-provider.saml.want-response-signed"
				disabled={disabled}
			/>
			<TextField
				name="meta.spPrivateKey"
				label="auth-provider.saml.sp-private-key"
				rows={4}
				help={<SecretHint isSet={provider?.meta?.spPrivateKeySet} />}
				disabled={disabled}
			/>
		</>
	);
}

function OauthFields({ provider, disabled }: FieldsProps) {
	return (
		<>
			<TextField
				name="meta.issuerUrl"
				label="auth-provider.oauth.issuer-url"
				placeholder="https://accounts.example.com"
				help={<T id="auth-provider.oauth.issuer-url-help" />}
				disabled={disabled}
			/>
			<TextField name="meta.clientId" label="auth-provider.oauth.client-id" required disabled={disabled} />
			<TextField
				name="meta.clientSecret"
				label="auth-provider.oauth.client-secret"
				type="password"
				help={<SecretHint isSet={provider?.meta?.clientSecretSet} />}
				disabled={disabled}
			/>
			<TextField
				name="meta.scopes"
				label="auth-provider.oauth.scopes"
				placeholder="openid email profile"
				disabled={disabled}
			/>
			{provider ? (
				<div className="mb-3">
					<label htmlFor="oauth-redirect-uri" className="form-label">
						<T id="auth-provider.oauth.redirect-uri" />
					</label>
					<input
						id="oauth-redirect-uri"
						className="form-control"
						readOnly
						value={`${window.location.origin}/api/auth/${provider.id}/callback`}
					/>
					<small className="form-hint">
						<T id="auth-provider.oauth.redirect-uri-help" />
					</small>
				</div>
			) : null}
			<details className="mb-3">
				<summary className="mb-2">
					<T id="auth-provider.oauth.manual-endpoints" />
				</summary>
				<TextField
					name="meta.authorizationUrl"
					label="auth-provider.oauth.authorization-url"
					disabled={disabled}
				/>
				<TextField name="meta.tokenUrl" label="auth-provider.oauth.token-url" disabled={disabled} />
				<TextField name="meta.userinfoUrl" label="auth-provider.oauth.userinfo-url" disabled={disabled} />
				<TextField name="meta.jwksUrl" label="auth-provider.oauth.jwks-url" disabled={disabled} />
			</details>
			<div className="row">
				<div className="col-md-4">
					<TextField
						name="meta.emailClaim"
						label="auth-provider.oauth.email-claim"
						placeholder="email"
						disabled={disabled}
					/>
				</div>
				<div className="col-md-4">
					<TextField
						name="meta.nameClaim"
						label="auth-provider.oauth.name-claim"
						placeholder="name"
						disabled={disabled}
					/>
				</div>
				<div className="col-md-4">
					<TextField
						name="meta.groupClaim"
						label="auth-provider.oauth.group-claim"
						placeholder="groups"
						disabled={disabled}
					/>
				</div>
			</div>
			<CheckField
				name="meta.useBasicAuth"
				label="auth-provider.oauth.use-basic-auth"
				help={<T id="auth-provider.oauth.use-basic-auth-help" />}
				disabled={disabled}
			/>
		</>
	);
}

/**
 * Directory sync settings. Only LDAP can be enumerated, so this is not offered
 * for the redirect based providers.
 */
function SyncFields({ disabled }: FieldsProps) {
	return (
		<>
			<hr />
			<h4>
				<T id="auth-provider.sync" />
			</h4>
			<p className="text-secondary">
				<T id="auth-provider.sync-intro" />
			</p>
			<CheckField
				name="meta.syncEnabled"
				label="auth-provider.sync-enabled"
				help={<T id="auth-provider.sync-enabled-help" />}
				disabled={disabled}
			/>
			<div className="row">
				<div className="col-md-6">
					<TextField
						name="meta.syncInterval"
						label="auth-provider.sync-interval"
						type="number"
						help={<T id="auth-provider.sync-interval-help" />}
						disabled={disabled}
					/>
				</div>
				<div className="col-md-6">
					<TextField
						name="meta.syncGroup"
						label="auth-provider.sync-group"
						help={<T id="auth-provider.sync-group-help" />}
						disabled={disabled}
					/>
				</div>
			</div>
			<TextField
				name="meta.syncFilter"
				label="auth-provider.sync-filter"
				placeholder="(objectClass=person)"
				help={<T id="auth-provider.sync-filter-help" />}
				disabled={disabled}
			/>
			<CheckField
				name="meta.syncDisableMissing"
				label="auth-provider.sync-disable-missing"
				help={<T id="auth-provider.sync-disable-missing-help" />}
				disabled={disabled}
			/>
		</>
	);
}

const TYPE_DEFAULTS: Record<AuthProviderType, Record<string, any>> = {
	ldap: {
		url: "",
		baseDn: "",
		bindDn: "",
		bindPassword: "",
		userFilter: "(|(uid={{username}})(mail={{username}}))",
		emailAttribute: "mail",
		nameAttribute: "cn",
		nicknameAttribute: "givenName",
		groupAttribute: "memberOf",
		groupFilter: "",
		loginAttributes: "",
		pageSize: 500,
		startTls: false,
		tlsRejectUnauthorized: true,
		syncEnabled: false,
		syncInterval: 60,
		syncFilter: "(objectClass=person)",
		syncGroup: "",
		syncDisableMissing: false,
	},
	saml: {
		entryPoint: "",
		issuer: "nginx-proxy-manager",
		idpCert: "",
		spPrivateKey: "",
		emailAttribute: "",
		nameAttribute: "",
		groupAttribute: "",
		wantAssertionsSigned: true,
		wantAuthnResponseSigned: false,
	},
	oauth: {
		issuerUrl: "",
		authorizationUrl: "",
		tokenUrl: "",
		userinfoUrl: "",
		jwksUrl: "",
		clientId: "",
		clientSecret: "",
		scopes: "openid email profile",
		emailClaim: "email",
		nameClaim: "name",
		groupClaim: "groups",
		useBasicAuth: false,
	},
};

interface Props extends InnerModalProps {
	provider: AuthProvider | AuthProviderType;
}
const AuthProviderModal = EasyModal.create(({ provider, visible, remove }: Props) => {
	const queryClient = useQueryClient();
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const existing = typeof provider === "string" ? undefined : provider;
	const type: AuthProviderType = typeof provider === "string" ? provider : provider.type;
	// Providers defined by environment variables are shown read only
	const readOnly = !!existing?.isEnvManaged;

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting || readOnly) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		// Blank secrets mean "keep what is stored", so don't send them at all
		const meta = { ...values.meta };
		for (const key of ["bindPassword", "spPrivateKey", "clientSecret"]) {
			if (meta[key] === "") {
				delete meta[key];
			}
		}

		// Number inputs hand back strings
		for (const key of ["pageSize", "syncInterval", "timeout"]) {
			if (typeof meta[key] !== "undefined" && meta[key] !== "") {
				meta[key] = Number(meta[key]);
			}
		}

		const payload = {
			name: values.name,
			isEnabled: values.isEnabled,
			meta: {
				...meta,
				autoCreateUser: values.meta.autoCreateUser,
				adminGroup: values.meta.adminGroup,
			},
		};

		try {
			if (existing) {
				await updateAuthProvider(existing.id, payload);
			} else {
				await createAuthProvider({ ...payload, type });
			}
			queryClient.invalidateQueries({ queryKey: ["auth-providers"] });
			queryClient.invalidateQueries({ queryKey: ["login-options"] });
			showObjectSuccess("auth-provider", "saved");
			remove();
		} catch (err: any) {
			setErrorMsg(err.message);
		}
		setIsSubmitting(false);
		setSubmitting(false);
	};

	const initialValues = {
		name: existing?.name ?? "",
		isEnabled: existing ? existing.isEnabled : true,
		meta: {
			...TYPE_DEFAULTS[type],
			...(existing?.meta ?? {}),
			autoCreateUser: existing?.meta?.autoCreateUser ?? false,
			adminGroup: existing?.meta?.adminGroup ?? "",
			// Secrets are never returned, so always start blank
			bindPassword: "",
			spPrivateKey: "",
			clientSecret: "",
		},
	};

	return (
		<Modal show={visible} onHide={remove} size="lg" scrollable>
			<Formik initialValues={initialValues as any} onSubmit={onSubmit}>
				{() => (
					<Form className={styles.form}>
						<Modal.Header closeButton>
							<Modal.Title>
								<T
									id={readOnly ? "object.view" : existing ? "object.edit" : "object.add"}
									tData={{ object: `auth-provider.type.${type}` }}
								/>
							</Modal.Title>
						</Modal.Header>
						<Modal.Body>
							<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible>
								{errorMsg}
							</Alert>
							{readOnly ? (
								<Alert variant="info">
									<T id="auth-provider.env-managed-help" />
								</Alert>
							) : null}

							<TextField
								name="name"
								label="auth-provider.name"
								placeholder={intl.formatMessage({ id: "auth-provider.name" })}
								help={<T id="auth-provider.name-help" />}
								required
								disabled={readOnly}
							/>
							<CheckField name="isEnabled" label="auth-provider.enabled" disabled={readOnly} />

							<hr />
							{type === "ldap" ? <LdapFields provider={existing} disabled={readOnly} /> : null}
							{type === "saml" ? <SamlFields provider={existing} disabled={readOnly} /> : null}
							{type === "oauth" ? <OauthFields provider={existing} disabled={readOnly} /> : null}
							{type === "ldap" ? <SyncFields disabled={readOnly} /> : null}

							<hr />
							<CheckField
								name="meta.autoCreateUser"
								label="auth-provider.auto-create-user"
								help={<T id="auth-provider.auto-create-user-help" />}
								disabled={readOnly}
							/>
							<TextField
								name="meta.adminGroup"
								label="auth-provider.admin-group"
								help={<T id="auth-provider.admin-group-help" />}
								disabled={readOnly}
							/>
						</Modal.Body>
						<Modal.Footer>
							<Button type="button" onClick={remove}>
								<T id={readOnly ? "close" : "cancel"} />
							</Button>
							{readOnly ? null : (
								<Button type="submit" className="btn-orange" isLoading={isSubmitting}>
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

export { showAuthProviderModal };
