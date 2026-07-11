import { IconCloudDataConnection, IconCloudOff } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Field } from "formik";
import type { ReactNode } from "react";
import Select, { type ActionMeta, components, type OptionProps } from "react-select";
import { type DnsProvider, getDnsProviders } from "src/api/backend";
import { intl, T } from "src/locale";

interface DnsProviderOption {
	readonly value: number;
	readonly label: string;
	readonly subLabel: string;
	readonly icon: ReactNode;
}

const Option = (props: OptionProps<DnsProviderOption>) => {
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
	statusBadge?: ReactNode;
}
export function DnsProviderField({
	name = "dnsProviderId",
	label = "dns-provider",
	id = "dnsProviderId",
	statusBadge,
}: Props) {
	const { isLoading, isError, error, data } = useQuery<DnsProvider[], Error>({
		queryKey: ["dns-record-providers"],
		queryFn: () => getDnsProviders(),
		staleTime: 60 * 1000,
	});

	const handleChange = (newValue: any, _actionMeta: ActionMeta<DnsProviderOption>, form: any) => {
		form.setFieldValue(name, newValue?.value);
	};

	const options: DnsProviderOption[] =
		data?.map((item: DnsProvider) => ({
			value: item.id || 0,
			label: item.name,
			subLabel: intl.formatMessage({ id: `dns-providers.type.${item.type}` }),
			icon: <IconCloudDataConnection size={14} className="text-teal" />,
		})) || [];

	// None option
	options?.unshift({
		value: 0,
		label: intl.formatMessage({ id: "dns-provider.none" }),
		subLabel: intl.formatMessage({ id: "dns-provider.none.subtitle" }),
		icon: <IconCloudOff size={14} className="text-secondary" />,
	});

	return (
		<Field name={name}>
			{({ field, form }: any) => (
				<div className="mb-3">
					<label className="form-label" htmlFor={id}>
						<T id={label} /> {statusBadge}
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
							onChange={(newValue, actionMeta) => handleChange(newValue, actionMeta, form)}
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
