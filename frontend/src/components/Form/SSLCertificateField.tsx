import { IconShield } from "@tabler/icons-react";
import { Field, useFormikContext } from "formik";
import Select, { type ActionMeta, components, type OptionProps } from "react-select";
import type { Certificate } from "src/api/backend";
import { useCertificates } from "src/hooks";
import { DateTimeFormat, intl } from "src/locale";

interface CertOption {
	readonly value: number | "new";
	readonly label: string;
	readonly subLabel: string;
	readonly icon: React.ReactNode;
}

const Option = (props: OptionProps<CertOption>) => {
	return (
		<components.Option {...props}>
			<div className="flex-fill">
				<div className="font-weight-medium">
					{props.data.icon} <strong>{props.data.label}</strong>
				</div>
				<div className="text-secondary mt-1 ps-3">{props.data.subLabel}</div>
			</div>
		</components.Option>
	);
};

interface Props {
	id?: string;
	name?: string;
	label?: string;
	required?: boolean;
	allowNew?: boolean;
	forHttp?: boolean; // the sslForced, http2Support, hstsEnabled, hstsSubdomains fields
}
export function SSLCertificateField({
	name = "certificateId",
	label = "ssl-certificate",
	id = "certificateId",
	required,
	allowNew,
	forHttp = true,
}: Props) {
	const { isLoading, isError, error, data } = useCertificates();
	const { values, setFieldValue } = useFormikContext();
	const v: any = values || {};

	const handleChange = (newValue: any, _actionMeta: ActionMeta<CertOption>) => {
		setFieldValue(name, newValue?.value);
		const {
			sslForced,
			http2Support,
			hstsEnabled,
			hstsSubdomains,
			dnsChallenge,
			dnsProvider,
			dnsProviderCredentials,
			propagationSeconds,
		} = v;
		if (forHttp && !newValue?.value) {
			sslForced && setFieldValue("sslForced", false);
			http2Support && setFieldValue("http2Support", false);
			hstsEnabled && setFieldValue("hstsEnabled", false);
			hstsSubdomains && setFieldValue("hstsSubdomains", false);
		}
		if (newValue?.value !== "new") {
			dnsChallenge && setFieldValue("dnsChallenge", undefined);
			dnsProvider && setFieldValue("dnsProvider", undefined);
			dnsProviderCredentials && setFieldValue("dnsProviderCredentials", undefined);
			propagationSeconds && setFieldValue("propagationSeconds", undefined);
		}
	};

	const options: CertOption[] =
		data?.map((cert: Certificate) => ({
			value: cert.id,
			label: cert.niceName,
			subLabel: `${cert.provider === "letsencrypt" ? "Let's Encrypt" : cert.provider} &mdash; Expires: ${
				cert.expiresOn ? DateTimeFormat(cert.expiresOn) : "N/A"
			}`,
			icon: <IconShield size={14} className="text-pink" />,
		})) || [];

	// Prepend the Add New option
	if (allowNew) {
		options?.unshift({
			value: "new",
			label: "Request a new Certificate",
			subLabel: "with Let's Encrypt",
			icon: <IconShield size={14} className="text-lime" />,
		});
	}

	// Prepend the None option
	if (!required) {
		options?.unshift({
			value: 0,
			label: "None",
			subLabel: forHttp ? "This host will not use HTTPS" : "No certificate assigned",
			icon: <IconShield size={14} className="text-red" />,
		});
	}

	return (
		<Field name={name}>
			{({ field, form }: any) => (
				<div className="mb-3">
					<label className="form-label" htmlFor={id}>
						{intl.formatMessage({ id: label })}
					</label>
					{isLoading ? <div className="placeholder placeholder-lg col-12 my-3 placeholder-glow" /> : null}
					{isError ? <div className="invalid-feedback">{`${error}`}</div> : null}
					{!isLoading && !isError ? (
						<Select
							className="react-select-container"
							classNamePrefix="react-select"
							defaultValue={options.find((o) => o.value === field.value) || options[0]}
							options={options}
							components={{ Option }}
							styles={{
								option: (base) => ({
									...base,
									height: "100%",
								}),
							}}
							onChange={handleChange}
						/>
					) : null}
					{form.errors[field.name] ? (
						<div className="invalid-feedback">
							{form.errors[field.name] && form.touched[field.name] ? form.errors[field.name] : null}
						</div>
					) : null}
				</div>
			)}
		</Field>
	);
}
