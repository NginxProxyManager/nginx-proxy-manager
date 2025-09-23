import cn from "classnames";
import { Field, useFormikContext } from "formik";
import { DNSProviderFields } from "src/components";
import { intl } from "src/locale";

export function SSLOptionsFields() {
	const { values, setFieldValue } = useFormikContext();
	const v: any = values || {};

	const newCertificate = v?.certificateId === "new";
	const hasCertificate = newCertificate || (v?.certificateId && v?.certificateId > 0);
	const { sslForced, http2Support, hstsEnabled, hstsSubdomains, meta } = v;
	const { dnsChallenge } = meta || {};

	const handleToggleChange = (e: any, fieldName: string) => {
		setFieldValue(fieldName, e.target.checked);
		if (fieldName === "meta.dnsChallenge" && !e.target.checked) {
			setFieldValue("meta.dnsProvider", undefined);
			setFieldValue("meta.dnsProviderCredentials", undefined);
			setFieldValue("meta.propagationSeconds", undefined);
		}
	};

	const toggleClasses = "form-check-input";
	const toggleEnabled = cn(toggleClasses, "bg-cyan");

	return (
		<>
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
									{intl.formatMessage({ id: "domains.force-ssl" })}
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
									{intl.formatMessage({ id: "domains.http2-support" })}
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
									{intl.formatMessage({ id: "domains.hsts-enabled" })}
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
									{intl.formatMessage({ id: "domains.hsts-subdomains" })}
								</span>
							</label>
						)}
					</Field>
				</div>
			</div>
			{newCertificate ? (
				<>
					<Field name="meta.dnsChallenge">
						{({ field }: any) => (
							<label className="form-check form-switch mt-1">
								<input
									className={dnsChallenge ? toggleEnabled : toggleClasses}
									type="checkbox"
									checked={!!dnsChallenge}
									onChange={(e) => handleToggleChange(e, field.name)}
								/>
								<span className="form-check-label">
									{intl.formatMessage({ id: "domains.use-dns" })}
								</span>
							</label>
						)}
					</Field>

					{dnsChallenge ? <DNSProviderFields /> : null}
				</>
			) : null}
		</>
	);
}
