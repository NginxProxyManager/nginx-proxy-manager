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

	const isOidc = form.meta.authMethod === "oidc";

	return (
		<>
			<div className="col-12">
				<FormLabelWithHelp
					label={<T id="credential-providers.infisical.auth-method" />}
					help="Universal Auth uses a Machine Identity client ID and secret. OIDC Auth uses a Machine Identity identity ID and a JWT from a file or environment variable (for CI or sidecars)."
				/>
				<select
					className="form-select"
					value={form.meta.authMethod || "universal"}
					onChange={(e) => setMeta("authMethod", e.target.value)}
				>
					<option value="universal">
						<T id="credential-providers.infisical.auth-universal" />
					</option>
					<option value="oidc">
						<T id="credential-providers.infisical.auth-oidc" />
					</option>
				</select>
			</div>
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
			{isOidc ? (
				<>
					<div className="col-12">
						<FormLabelWithHelp
							label={<T id="credential-providers.infisical.identity-id" />}
							help="Machine Identity OIDC Auth identity ID from Infisical (not the Universal Auth client ID)."
						/>
						<input
							className="form-control font-monospace"
							value={form.meta.identityId || ""}
							onChange={(e) => setMeta("identityId", e.target.value)}
						/>
					</div>
					<div className="col-md-6">
						<FormLabelWithHelp
							label={<T id="credential-providers.infisical.jwt-file" />}
							help="Path inside the NPM container to a JWT file (e.g. from a mounted volume or sidecar)."
						/>
						<input
							className="form-control font-monospace"
							value={form.meta.jwtFilePath || ""}
							onChange={(e) => setMeta("jwtFilePath", e.target.value)}
							placeholder="/data/infisical-oidc.jwt"
						/>
					</div>
					<div className="col-md-6">
						<FormLabelWithHelp
							label={<T id="credential-providers.infisical.jwt-env" />}
							help="Environment variable name holding the OIDC JWT. Use only one of file path or env var."
						/>
						<input
							className="form-control font-monospace"
							value={form.meta.jwtEnvVar || ""}
							onChange={(e) => setMeta("jwtEnvVar", e.target.value)}
							placeholder="INFISICAL_OIDC_JWT"
						/>
					</div>
				</>
			) : (
				<>
					<div className="col-md-6">
						<FormLabelWithHelp
							label={<T id="credential-providers.infisical.client-id" />}
							help="Universal Auth client ID from your Infisical Machine Identity (not Infisical OIDC Auth tab)."
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
			)}
		</>
	);
}
