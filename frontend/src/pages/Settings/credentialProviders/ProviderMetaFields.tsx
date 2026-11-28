import { FormLabelWithHelp } from "src/components/Form/FormLabelWithHelp";
import { T } from "src/locale";
import { InfisicalProviderFields } from "./InfisicalProviderFields";
import type { CredentialProviderFormState } from "./types";

type Props = {
	form: CredentialProviderFormState;
	editingId: number | null;
	onChange: (next: CredentialProviderFormState) => void;
};

export function ProviderMetaFields({ form, editingId, onChange }: Props) {
	const setMeta = (key: string, value: string) =>
		onChange({ ...form, meta: { ...form.meta, [key]: value } });

	if (form.type === "infisical") {
		return <InfisicalProviderFields form={form} editingId={editingId} onChange={onChange} />;
	}

	if (form.type === "vault") {
		return (
			<>
				<div className="col-12">
					<FormLabelWithHelp
						label={<T id="credential-providers.vault.address" />}
						help="HashiCorp Vault API address (e.g. https://vault.example:8200). Not Azure Key Vault or Infisical."
					/>
					<input
						className="form-control"
						value={form.meta.address || ""}
						onChange={(e) => setMeta("address", e.target.value)}
					/>
				</div>
				<div className="col-md-6">
					<FormLabelWithHelp label={<T id="credential-providers.vault.mount" />} help="KV secrets engine mount path." />
					<input
						className="form-control"
						value={form.meta.mount || ""}
						onChange={(e) => setMeta("mount", e.target.value)}
					/>
				</div>
				<div className="col-md-6">
					<FormLabelWithHelp label={<T id="credential-providers.vault.role" />} help="Vault role name for JWT/OIDC login." />
					<input
						className="form-control"
						value={form.meta.role || ""}
						onChange={(e) => setMeta("role", e.target.value)}
					/>
				</div>
			</>
		);
	}

	if (form.type === "aws") {
		return (
			<>
				<div className="col-md-6">
					<FormLabelWithHelp label={<T id="credential-providers.aws.region" />} help="AWS region for Secrets Manager." />
					<input
						className="form-control"
						value={form.meta.region || ""}
						onChange={(e) => setMeta("region", e.target.value)}
					/>
				</div>
				<div className="col-md-6">
					<FormLabelWithHelp
						label={<T id="credential-providers.aws.role-arn" />}
						help="IAM role ARN to assume via web identity / OIDC."
					/>
					<input
						className="form-control font-monospace"
						value={form.meta.roleArn || ""}
						onChange={(e) => setMeta("roleArn", e.target.value)}
					/>
				</div>
			</>
		);
	}

	if (form.type === "azure") {
		return (
			<>
				<div className="col-md-6">
					<FormLabelWithHelp label={<T id="credential-providers.azure.tenant" />} help="Azure AD tenant ID." />
					<input
						className="form-control font-monospace"
						value={form.meta.tenantId || ""}
						onChange={(e) => setMeta("tenantId", e.target.value)}
					/>
				</div>
				<div className="col-md-6">
					<FormLabelWithHelp
						label={<T id="credential-providers.azure.vault-url" />}
						help="Azure Key Vault URL, e.g. https://myvault.vault.azure.net"
					/>
					<input
						className="form-control"
						value={form.meta.vaultUrl || ""}
						onChange={(e) => setMeta("vaultUrl", e.target.value)}
					/>
				</div>
			</>
		);
	}

	return (
		<div className="col-12">
			<FormLabelWithHelp
				label={<T id="credential-providers.http.url-template" />}
				help="URL template with {path} placeholder for secret resolution."
			/>
			<input
				className="form-control font-monospace"
				value={form.meta.urlTemplate || ""}
				onChange={(e) => setMeta("urlTemplate", e.target.value)}
			/>
		</div>
	);
}
