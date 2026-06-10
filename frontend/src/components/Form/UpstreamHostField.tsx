import { IconServer, IconServerOff } from "@tabler/icons-react";
import { Field, useFormikContext } from "formik";
import type { ReactNode } from "react";
import Select, { type ActionMeta, components, type OptionProps } from "react-select";
import type { UpstreamHost } from "src/api/backend";
import { useUpstreamHosts } from "src/hooks";
import { intl, T } from "src/locale";

interface UpstreamOption {
	readonly value: number;
	readonly label: string;
	readonly subLabel: string;
	readonly icon: ReactNode;
}

const Option = (props: OptionProps<UpstreamOption>) => {
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
}
export function UpstreamHostField({ name = "upstreamHostId", label = "upstream-host", id = "upstreamHostId" }: Props) {
	const { isLoading, isError, error, data } = useUpstreamHosts(["owner", "servers"]);
	const { setFieldValue } = useFormikContext();

	const handleChange = (newValue: any, _actionMeta: ActionMeta<UpstreamOption>) => {
		setFieldValue(name, newValue?.value);
	};

	const options: UpstreamOption[] =
		data?.map((item: UpstreamHost) => ({
			value: item.id || 0,
			label: item.name,
			subLabel: `${item.forwardScheme}:// - ${item.method.replace(/_/g, " ")} - ${item.servers?.length || 0} server(s)`,
			icon: <IconServer size={14} className="text-teal" />,
		})) || [];

	// None option
	options?.unshift({
		value: 0,
		label: intl.formatMessage({ id: "upstream-host.none" }),
		subLabel: intl.formatMessage({ id: "upstream-host.none.subtitle" }),
		icon: <IconServerOff size={14} className="text-secondary" />,
	});

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
