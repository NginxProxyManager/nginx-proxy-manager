import { IconServer, IconServerOff } from "@tabler/icons-react";
import type { ReactNode } from "react";
import Select, { type ActionMeta, components, type OptionProps } from "react-select";
import type { UpstreamHost } from "src/api/backend";
import { useUpstreamHosts } from "src/hooks";
import { intl } from "src/locale";

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
	value: number;
	onChange: (upstreamHostId: number) => void;
}

export function UpstreamHostSelect({ value, onChange }: Props) {
	const { isLoading, isError, error, data } = useUpstreamHosts(["owner", "servers"]);

	const options: UpstreamOption[] =
		data?.map((item: UpstreamHost) => ({
			value: item.id || 0,
			label: item.name,
			subLabel: `${item.forwardScheme}:// - ${item.method.replace(/_/g, " ")} - ${item.servers?.length || 0} server(s)`,
			icon: <IconServer size={14} className="text-teal" />,
		})) || [];

	options.unshift({
		value: 0,
		label: intl.formatMessage({ id: "upstream-host.none" }),
		subLabel: intl.formatMessage({ id: "upstream-host.none.subtitle" }),
		icon: <IconServerOff size={14} className="text-secondary" />,
	});

	if (isLoading) return <div className="placeholder placeholder-lg col-12 my-3 placeholder-glow" />;
	if (isError) return <div className="invalid-feedback">{`${error}`}</div>;

	return (
		<Select
			className="react-select-container"
			classNamePrefix="react-select"
			value={options.find((o) => o.value === value) || options[0]}
			options={options}
			components={{ Option }}
			styles={{
				option: (base) => ({
					...base,
					height: "100%",
				}),
			}}
			onChange={(newValue: any, _actionMeta: ActionMeta<UpstreamOption>) => onChange(newValue?.value ?? 0)}
		/>
	);
}
