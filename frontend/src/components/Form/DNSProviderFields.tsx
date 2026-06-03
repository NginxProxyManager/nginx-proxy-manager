import { IconAlertTriangle } from "@tabler/icons-react";
import CodeEditor from "@uiw/react-textarea-code-editor";
import { Field, useFormikContext } from "formik";
import { useState } from "react";
import Select, { type ActionMeta } from "react-select";
import type { DNSProvider } from "src/api/backend";
import { useCredentialProviders, useCredentials, useDnsProviders } from "src/hooks";
import { intl, T } from "src/locale";
import styles from "./DNSProviderFields.module.css";

interface DNSProviderOption {
	readonly value: string;
	readonly label: string;
	readonly credentials: string;
}

interface Props {
	showBoundaryBox?: boolean;
}
export function DNSProviderFields({ showBoundaryBox = false }: Props) {
	const { values, setFieldValue } = useFormikContext();
	const { data: dnsProviders, isLoading } = useDnsProviders();
	const { data: storedCredentials } = useCredentials();
	const { data: externalProviders } = useCredentialProviders();
	const [dnsProviderId, setDnsProviderId] = useState<string | null>(null);
	const [credentialSource, setCredentialSource] = useState<"manual" | "internal" | "external">("manual");

	const v: any = values || {};

	const handleChange = (newValue: any, _actionMeta: ActionMeta<DNSProviderOption>) => {
		setFieldValue("meta.dnsProvider", newValue?.value);
		setFieldValue("meta.dnsProviderCredentials", newValue?.credentials);
		setFieldValue("meta.credentialRef", undefined);
		setCredentialSource("manual");
		setDnsProviderId(newValue?.value);
	};

	const options: DNSProviderOption[] =
		dnsProviders?.map((p: DNSProvider) => ({
			value: p.id,
			label: p.name,
			credentials: p.credentials,
		})) || [];

	return (
		<div className={showBoundaryBox ? styles.dnsChallengeWarning : undefined}>
			<p className="text-warning">
				<IconAlertTriangle size={16} className="me-1" />
				<T id="certificates.dns.warning" />
			</p>

			<Field name="meta.dnsProvider">
				{({ field }: any) => (
					<div className="row">
						<label htmlFor="dnsProvider" className="form-label">
							<T id="certificates.dns.provider" />
						</label>
						<Select
							className="react-select-container"
							classNamePrefix="react-select"
							name={field.name}
							id="dnsProvider"
							closeMenuOnSelect={true}
							isClearable={false}
							placeholder={intl.formatMessage({ id: "certificates.dns.provider.placeholder" })}
							isLoading={isLoading}
							isSearchable
							onChange={handleChange}
							options={options}
						/>
					</div>
				)}
			</Field>

			{dnsProviderId ? (
				<>
					<div className="mt-3">
						<label htmlFor="credentialSource" className="form-label">
							<T id="credentials.source" />
						</label>
						<select
							id="credentialSource"
							className="form-select"
							value={credentialSource}
							onChange={(e) => {
								const src = e.target.value as "manual" | "internal" | "external";
								setCredentialSource(src);
								setFieldValue("meta.credentialRef", undefined);
								setFieldValue("meta.dnsProviderCredentials", undefined);
							}}
						>
							<option value="manual">
								<T id="credentials.source.manual" />
							</option>
							{storedCredentials?.length ? (
								<option value="internal">
									<T id="credentials.source.internal" />
								</option>
							) : null}
							{externalProviders?.length ? (
								<option value="external">
									<T id="credentials.source.external" />
								</option>
							) : null}
						</select>
					</div>

					{credentialSource === "internal" && storedCredentials?.length ? (
						<div className="mt-3">
							<label htmlFor="storedCredential" className="form-label">
								<T id="credentials.stored" />
							</label>
							<select
								id="storedCredential"
								className="form-select"
								value={String(v.meta?.credentialRef?.id || "")}
								onChange={(e) => {
									const id = Number.parseInt(e.target.value, 10);
									if (id) {
										setFieldValue("meta.credentialRef", { type: "internal", id });
										setFieldValue("meta.dnsProviderCredentials", undefined);
									}
								}}
							>
								<option value="">—</option>
								{storedCredentials
									.filter((c) => c.dnsProvider === dnsProviderId)
									.map((c) => (
										<option key={c.id} value={c.id}>
											{c.name}
										</option>
									))}
							</select>
						</div>
					) : null}

					{credentialSource === "external" && externalProviders?.length ? (
						<div className="mt-3 row g-2">
							<div className="col-md-6">
								<label className="form-label">
									<T id="credential-providers" />
								</label>
								<select
									className="form-select"
									value={String(v.meta?.credentialRef?.providerId || "")}
									onChange={(e) => {
										const providerId = Number.parseInt(e.target.value, 10);
										setFieldValue("meta.credentialRef", {
											type: "external",
											providerId,
											path: v.meta?.credentialRef?.path || "",
										});
										setFieldValue("meta.dnsProviderCredentials", undefined);
									}}
								>
									<option value="">—</option>
									{externalProviders.map((p) => (
										<option key={p.id} value={p.id}>
											{p.name} ({p.type})
										</option>
									))}
								</select>
							</div>
							<div className="col-md-6">
								<label className="form-label">
									<T id="credentials.secret-path" />
								</label>
								<input
									className="form-control"
									placeholder="dns/cloudflare/prod"
									value={v.meta?.credentialRef?.path || ""}
									onChange={(e) => {
										setFieldValue("meta.credentialRef", {
											type: "external",
											providerId: v.meta?.credentialRef?.providerId,
											path: e.target.value,
										});
									}}
								/>
							</div>
						</div>
					) : null}

					{credentialSource === "manual" ? (
					<Field name="meta.dnsProviderCredentials">
						{({ field }: any) => (
							<div className="mt-3">
								<label htmlFor="dnsProviderCredentials" className="form-label">
									<T id="certificates.dns.credentials" />
								</label>
								<CodeEditor
									language="bash"
									id="dnsProviderCredentials"
									padding={15}
									data-color-mode="dark"
									minHeight={130}
									indentWidth={2}
									style={{
										fontFamily:
											"ui-monospace,SFMono-Regular,SF Mono,Consolas,Liberation Mono,Menlo,monospace",
										borderRadius: "0.3rem",
										minHeight: "130px",
										backgroundColor: "var(--tblr-bg-surface-dark)",
									}}
									value={v.meta.dnsProviderCredentials || ""}
									{...field}
								/>
								<div>
									<small className="text-muted">
										<T id="certificates.dns.credentials-note" />
									</small>
								</div>
								<div>
									<small className="text-danger">
										<T id="certificates.dns.credentials-warning" />
									</small>
								</div>
							</div>
						)}
					</Field>
					) : null}
					<Field name="meta.propagationSeconds">
						{({ field }: any) => (
							<div className="mt-3">
								<label htmlFor="propagationSeconds" className="form-label">
									<T id="certificates.dns.propagation-seconds" />
								</label>
								<input
									id="propagationSeconds"
									type="number"
									className="form-control"
									min={0}
									max={7200}
									{...field}
								/>
								<small className="text-muted">
									<T id="certificates.dns.propagation-seconds-note" />
								</small>
							</div>
						)}
					</Field>
				</>
			) : null}
		</div>
	);
}
