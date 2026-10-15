import { FormLabelWithHelp } from "src/components/Form/FormLabelWithHelp";
import { T } from "src/locale";
import type { CredentialProviderFormState, ProviderType } from "./types";

type Props = {
	form: CredentialProviderFormState;
	editingId: number | null;
	onChange: (next: CredentialProviderFormState) => void;
};

const issuerHelp: Partial<Record<ProviderType, string>> = {
	vault: "OIDC issuer URL for Vault JWT auth (your IdP or Vault's OIDC role issuer).",
	aws: "OIDC issuer URL trusted by AWS IAM for web identity (e.g. GitHub Actions, GitLab).",
	http: "OIDC issuer used to obtain a bearer token for the HTTP secret endpoint.",
};

export function OidcProviderFields({ form, editingId, onChange }: Props) {
	return (
		<>
			<div className="col-12">
				<FormLabelWithHelp
					label={<T id="credential-providers.oidc.issuer" />}
					help={issuerHelp[form.type] || "OIDC issuer URL for client credentials or JWT bearer flow."}
				/>
				<input
					className="form-control"
					value={form.oidcIssuer}
					onChange={(e) => onChange({ ...form, oidcIssuer: e.target.value })}
				/>
			</div>
			<div className="col-md-6">
				<FormLabelWithHelp
					label={<T id="credential-providers.oidc.client-id" />}
					help="OAuth2 / OIDC client identifier registered with the issuer."
				/>
				<input
					className="form-control"
					value={form.oidcClientId}
					onChange={(e) => onChange({ ...form, oidcClientId: e.target.value })}
				/>
			</div>
			<div className="col-md-6">
				<FormLabelWithHelp
					label={
						<>
							<T id="credential-providers.oidc.client-secret" /> {editingId ? "(leave blank to keep)" : ""}
						</>
					}
					help="Client secret stored encrypted under /data/credentials/providers/."
				/>
				<input
					type="password"
					className="form-control"
					value={form.oidcClientSecret}
					onChange={(e) => onChange({ ...form, oidcClientSecret: e.target.value })}
				/>
			</div>
			<div className="col-md-6">
				<FormLabelWithHelp
					label={<T id="credential-providers.oidc.audience" />}
					help="Optional audience claim for the token request."
				/>
				<input
					className="form-control"
					value={form.oidcAudience}
					onChange={(e) => onChange({ ...form, oidcAudience: e.target.value })}
				/>
			</div>
		</>
	);
}
