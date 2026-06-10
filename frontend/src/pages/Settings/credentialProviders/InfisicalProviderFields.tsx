import { FormLabelWithHelp } from "src/components/Form/FormLabelWithHelp";
import { T } from "src/locale";
import type { CredentialProviderFormState } from "./types";

type Props = {
	form: CredentialProviderFormState;
	editingId: number | null;
	onChange: (next: CredentialProviderFormState) => void;
};

export function InfisicalProviderFields({ form, editingId, onChange }: Props) {
	const setMeta = (key: string, value: string) =>
		onChange({ ...form, meta: { ...form.meta, [key]: value } });

	return (
		<>
			<div className="col-12">
				<FormLabelWithHelp
					label={<T id="credential-providers.infisical.host" />}
					help="Base URL of your Infisical instance, without a trailing slash (e.g. https://vault.example.com or https://app.infisical.com)."
				/>
				<input
					className="form-control"
					value={form.meta.host || ""}
					onChange={(e) => setMeta("host", e.target.value)}
				/>
			</div>
			<div className="col-md-6">
				<FormLabelWithHelp
					label={<T id="credential-providers.infisical.workspace-id" />}
					help="Infisical Project ID (UUID) from Project Settings. This is workspace_id in the API, not the project slug."
				/>
				<input
					className="form-control font-monospace"
					value={form.meta.workspaceId || ""}
					onChange={(e) => setMeta("workspaceId", e.target.value)}
				/>
			</div>
			<div className="col-md-6">
				<FormLabelWithHelp
					label={<T id="credential-providers.infisical.environment" />}
					help="Environment slug in Infisical (e.g. prod, staging, dev)."
				/>
				<input
					className="form-control"
					value={form.meta.environmentSlug || "prod"}
					onChange={(e) => setMeta("environmentSlug", e.target.value)}
				/>
			</div>
			<div className="col-md-6">
				<FormLabelWithHelp
					label={<T id="credential-providers.infisical.client-id" />}
					help="Universal Auth client ID from your Infisical Machine Identity."
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
							<T id="credential-providers.infisical.client-secret" />{" "}
							{editingId ? "(leave blank to keep)" : ""}
						</>
					}
					help="Universal Auth client secret. Stored encrypted on the NPM data volume."
				/>
				<input
					type="password"
					className="form-control"
					value={form.oidcClientSecret}
					onChange={(e) => onChange({ ...form, oidcClientSecret: e.target.value })}
				/>
			</div>
		</>
	);
}
