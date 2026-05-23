import cn from "classnames";
import { Field, useFormikContext } from "formik";
import { DNSProviderFields, DomainNamesField } from "src/components";
import { T } from "src/locale";

interface Props {
	forHttp?: boolean; // the sslForced, http2Support, hstsEnabled, hstsSubdomains fields
	forProxyHost?: boolean; // the advanced fields
	forceDNSForNew?: boolean;
	requireDomainNames?: boolean; // used for streams
	color?: string;
}
export function SSLOptionsFields({ forHttp = true, forProxyHost = false, forceDNSForNew, requireDomainNames, color = "bg-cyan" }: Props) {
	const { values, setFieldValue } = useFormikContext();
	const v: any = values || {};

	const newCertificate = v?.certificateId === "new";
	const hasCertificate = newCertificate || (v?.certificateId && v?.certificateId > 0);
	const { sslForced, http2Support, hstsEnabled, hstsSubdomains, trustForwardedProto, meta } = v;
	const { dnsChallenge } = meta || {};

	if (forceDNSForNew && newCertificate && !dnsChallenge) {
		setFieldValue("meta.dnsChallenge", true);
	}

	const handleToggleChange = (e: any, fieldName: string) => {
		setFieldValue(fieldName, e.target.checked);
		if (fieldName === "meta.dnsChallenge" && !e.target.checked) {
			setFieldValue("meta.dnsProvider", undefined);
			setFieldValue("meta.dnsProviderCredentials", undefined);
			setFieldValue("meta.propagationSeconds", undefined);
		}
	};

	const toggleClasses = "form-check-input";
	const toggleEnabled = cn(toggleClasses, color);

	const getHttpOptions = () => (
		<div>
			<div className="row">
				<div className="col-6">
					<Field name="sslForced">
						{({ field }: any) => (
							<label className="form-check form-switch mt-1">
								<input
									className={sslForced ? toggleEnabled : toggleClasses}
									type="checkbox"
									checked={!!sslForced}
									onChange={(e) => handleToggleChange(e, field.name)}
									disabled={!hasCertificate}
								/>
								<span className="form-check-label">
									<T id="domains.force-ssl" />
								</span>
							</label>
						)}
					</Field>
				</div>
				<div className="col-6">
					<Field name="http2Support">
						{({ field }: any) => (
							<label className="form-check form-switch mt-1">
								<input
									className={http2Support ? toggleEnabled : toggleClasses}
									type="checkbox"
									checked={!!http2Support}
									onChange={(e) => handleToggleChange(e, field.name)}
									disabled={!hasCertificate}
								/>
								<span className="form-check-label">
									<T id="domains.http2-support" />
								</span>
							</label>
						)}
					</Field>
				</div>
			</div>
			<div className="row">
				<div className="col-6">
					<Field name="hstsEnabled">
						{({ field }: any) => (
							<label className="form-check form-switch mt-1">
								<input
									className={hstsEnabled ? toggleEnabled : toggleClasses}
									type="checkbox"
									checked={!!hstsEnabled}
									onChange={(e) => handleToggleChange(e, field.name)}
									disabled={!hasCertificate || !sslForced}
								/>
								<span className="form-check-label">
									<T id="domains.hsts-enabled" />
								</span>
							</label>
						)}
					</Field>
				</div>
				<div className="col-6">
					<Field name="hstsSubdomains">
						{({ field }: any) => (
							<label className="form-check form-switch mt-1">
								<input
									className={hstsSubdomains ? toggleEnabled : toggleClasses}
									type="checkbox"
									checked={!!hstsSubdomains}
									onChange={(e) => handleToggleChange(e, field.name)}
									disabled={!hasCertificate || !hstsEnabled}
								/>
								<span className="form-check-label">
									<T id="domains.hsts-subdomains" />
								</span>
							</label>
						)}
					</Field>
				</div>
			</div>
		</div>
	);

	const getHttpAdvancedOptions = () =>(
		<div>
			<details>
				<summary className="mb-1"><T id="domains.advanced" /></summary>
				<div className="row">
					<div className="col-12">
						<Field name="trustForwardedProto">
							{({ field }: any) => (
								<label className="form-check form-switch mt-1">
									<input
										className={trustForwardedProto ? toggleEnabled : toggleClasses}
										type="checkbox"
										checked={!!trustForwardedProto}
										onChange={(e) => handleToggleChange(e, field.name)}
										disabled={!hasCertificate || !sslForced}
									/>
									<span className="form-check-label">
										<T id="domains.trust-forwarded-proto" />
									</span>
								</label>
							)}
						</Field>
					</div>
				</div>
			</details>
		</div>
	);

	return (
		<div>
			{forHttp ? getHttpOptions() : null}
			{newCertificate ? (
				<>
					<Field name="meta.dnsChallenge">
						{({ field }: any) => (
							<label className="form-check form-switch mt-1">
								<input
									className={dnsChallenge ? toggleEnabled : toggleClasses}
									type="checkbox"
									checked={forceDNSForNew ? true : !!dnsChallenge}
									disabled={forceDNSForNew}
									onChange={(e) => handleToggleChange(e, field.name)}
								/>
								<span className="form-check-label">
									<T id="domains.use-dns" />
								</span>
							</label>
						)}
					</Field>
					{requireDomainNames ? <DomainNamesField isWildcardPermitted dnsProviderWildcardSupported /> : null}
					{dnsChallenge ? <DNSProviderFields showBoundaryBox /> : null}
				</>
			) : null}
			{forProxyHost && forHttp ? getHttpAdvancedOptions() : null}
		</div>
	);
}
