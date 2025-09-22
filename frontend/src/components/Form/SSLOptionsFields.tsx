import cn from "classnames";
import { Field, useFormikContext } from "formik";
import { DNSProviderFields } from "src/components";

export function SSLOptionsFields() {
	const { values, setFieldValue } = useFormikContext();
	const v: any = values || {};

	const newCertificate = v?.certificateId === "new";
	const hasCertificate = newCertificate || (v?.certificateId && v?.certificateId > 0);
	const { sslForced, http2Support, hstsEnabled, hstsSubdomains, dnsChallenge } = v;

	const handleToggleChange = (e: any, fieldName: string) => {
		setFieldValue(fieldName, e.target.checked);
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
								<span className="form-check-label">Force SSL</span>
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
								<span className="form-check-label">HTTP/2 Support</span>
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
								<span className="form-check-label">HSTS Enabled</span>
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
								<span className="form-check-label">HSTS Enabled</span>
							</label>
						)}
					</Field>
				</div>
			</div>
			{newCertificate ? (
				<>
					<Field name="dnsChallenge">
						{({ field }: any) => (
							<label className="form-check form-switch mt-1">
								<input
									className={dnsChallenge ? toggleEnabled : toggleClasses}
									type="checkbox"
									checked={!!dnsChallenge}
									onChange={(e) => handleToggleChange(e, field.name)}
								/>
								<span className="form-check-label">Use a DNS Challenge</span>
							</label>
						)}
					</Field>

					{dnsChallenge ? <DNSProviderFields /> : null}

					<Field name="letsencryptEmail">
						{({ field }: any) => (
							<div className="mt-5">
								<label htmlFor="letsencryptEmail" className="form-label">
									Email Address for Let's Encrypt
								</label>
								<input
									id="letsencryptEmail"
									type="email"
									className="form-control"
									required
									{...field}
								/>
							</div>
						)}
					</Field>
				</>
			) : null}
		</>
	);
}
