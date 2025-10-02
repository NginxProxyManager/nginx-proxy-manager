import { Field, useFormikContext } from "formik";
import { useState } from "react";
import Select, { type ActionMeta } from "react-select";
import type { DNSProvider } from "src/api/backend";
import { useDnsProviders } from "src/hooks";
import styles from "./DNSProviderFields.module.css";

interface DNSProviderOption {
	readonly value: string;
	readonly label: string;
	readonly credentials: string;
}
export function DNSProviderFields() {
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
		<div className={styles.dnsChallengeWarning}>
			<p className="text-info">
				This section requires some knowledge about Certbot and DNS plugins. Please consult the respective
				plugins documentation.
			</p>

			<Field name="meta.dnsProvider">
				{({ field }: any) => (
					<div className="row">
						<label htmlFor="dnsProvider" className="form-label">
							DNS Provider
						</label>
						<Select
							className="react-select-container"
							classNamePrefix="react-select"
							name={field.name}
							id="dnsProvider"
							closeMenuOnSelect={true}
							isClearable={false}
							placeholder="Select a Provider..."
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
									Credentials File Content
								</label>
								<textarea
									id="dnsProviderCredentials"
									className="form-control textareaMono"
									rows={3}
									spellCheck={false}
									value={v.meta.dnsProviderCredentials || ""}
									{...field}
								/>
								<div>
									<small className="text-muted">
										This plugin requires a configuration file containing an API token or other
										credentials to your provider
									</small>
								</div>
								<div>
									<small className="text-danger">
										This data will be stored as plaintext in the database and in a file!
									</small>
								</div>
							</div>
						)}
					</Field>
					<Field name="meta.propagationSeconds">
						{({ field }: any) => (
							<div className="mt-3">
								<label htmlFor="propagationSeconds" className="form-label">
									Propagation Seconds
								</label>
								<input
									id="propagationSeconds"
									type="number"
									x
									className="form-control"
									min={0}
									max={600}
									{...field}
								/>
								<small className="text-muted">
									Leave empty to use the plugins default value. Number of seconds to wait for DNS
									propagation.
								</small>
							</div>
						)}
					</Field>
				</>
			) : null}
		</div>
	);
}
