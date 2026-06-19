import { IconLock, IconLockOpen2 } from "@tabler/icons-react";
import { Field, useFormikContext } from "formik";
import type { ReactNode } from "react";
import Select, { type ActionMeta, components, type OptionProps } from "react-select";
import type { AccessList } from "src/api/backend";
import { useLocaleState } from "src/context";
import { useAccessLists } from "src/hooks";
import { formatDateTime, intl, T } from "src/locale";

interface AccessOption {
	readonly value: number;
	readonly label: string;
	readonly subLabel: string;
	readonly icon: ReactNode;
}

const Option = (props: OptionProps<AccessOption>) => {
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
export function AccessField({ name = "accessListId", label = "access-list", id = "accessListId" }: Props) {
	const { locale } = useLocaleState();
	const { isLoading, isError, error, data } = useAccessLists(["owner", "items", "clients"]);
	const { setFieldValue } = useFormikContext();

	const handleChange = (newValue: any, _actionMeta: ActionMeta<AccessOption>) => {
		setFieldValue(name, newValue?.value);
	};

	const options: AccessOption[] =
		data?.map((item: AccessList) => ({
			value: item.id || 0,
			label: item.name,
			subLabel: intl.formatMessage(
				{ id: "access-list.subtitle" },
				{
					users: item?.items?.length,
					rules: item?.clients?.length,
					date: item?.createdOn ? formatDateTime(item?.createdOn, locale) : "N/A",
				},
			),
			icon: <IconLock size={14} className="text-lime" />,
		})) || [];

	// Public option
	options?.unshift({
		value: 0,
		label: intl.formatMessage({ id: "access-list.public" }),
		subLabel: intl.formatMessage({ id: "access-list.public.subtitle" }),
		icon: <IconLockOpen2 size={14} className="text-red" />,
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
