import { IconShield } from "@tabler/icons-react";
import { Field, useFormikContext } from "formik";
import Select, { type ActionMeta, components, type OptionProps } from "react-select";
import type { Certificate } from "src/api/backend";
import { useLocaleState } from "src/context";
import { useCertificates } from "src/hooks";
import { formatDateTime, intl, T } from "src/locale";

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
	const { locale } = useLocaleState();
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
			subLabel: `${cert.provider === "letsencrypt" ? intl.formatMessage({ id: "lets-encrypt" }) : cert.provider} — ${intl.formatMessage({ id: "expires.on" }, { date: cert.expiresOn ? formatDateTime(cert.expiresOn, locale) : "N/A" })}`,
			icon: <IconShield size={14} className="text-pink" />,
		})) || [];

	// Prepend the Add New option
	if (allowNew) {
		options?.unshift({
			value: "new",
			label: intl.formatMessage({ id: "certificates.request.title" }),
			subLabel: intl.formatMessage({ id: "certificates.request.subtitle" }),
			icon: <IconShield size={14} className="text-lime" />,
		});
	}

	// Prepend the None option
	if (!required) {
		options?.unshift({
			value: 0,
			label: intl.formatMessage({ id: "certificate.none.title" }),
			subLabel: forHttp
				? intl.formatMessage({ id: "certificate.none.subtitle.for-http" })
				: intl.formatMessage({ id: "certificate.none.subtitle" }),
			icon: <IconShield size={14} className="text-red" />,
		});
	}

	return (
		<Field name={name}>
			{({ field, form }: any) => (
				<div className="mb-3">
					<label className="form-label" htmlFor={id}>
						<T id={label} />
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
