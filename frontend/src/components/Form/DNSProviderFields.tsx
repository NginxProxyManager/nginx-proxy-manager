import { IconAlertTriangle } from "@tabler/icons-react";
import CodeEditor from "@uiw/react-textarea-code-editor";
import { Field, useFormikContext } from "formik";
import { useState } from "react";
import Select, { type ActionMeta } from "react-select";
import type { DNSProvider } from "src/api/backend";
import { useDnsProviders } from "src/hooks";
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
	const [dnsProviderId, setDnsProviderId] = useState<string | null>(null);

	const v: any = values || {};

	const handleChange = (newValue: any, _actionMeta: ActionMeta<DNSProviderOption>) => {
		setFieldValue("meta.dnsProvider", newValue?.value);
		setFieldValue("meta.dnsProviderCredentials", newValue?.credentials);
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
