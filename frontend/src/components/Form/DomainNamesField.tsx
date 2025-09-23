import { Field, useFormikContext } from "formik";
import type { ActionMeta, MultiValue } from "react-select";
import CreatableSelect from "react-select/creatable";
import { intl } from "src/locale";
import { validateDomain, validateDomains } from "src/modules/Validations";

export type SelectOption = {
	label: string;
	value: string;
	color?: string;
};

interface Props {
	id?: string;
	maxDomains?: number;
	isWildcardPermitted?: boolean;
	dnsProviderWildcardSupported?: boolean;
	name?: string;
	label?: string;
}
export function DomainNamesField({
	name = "domainNames",
	label = "domain-names",
	id = "domainNames",
	maxDomains,
	isWildcardPermitted = true,
	dnsProviderWildcardSupported = true,
}: Props) {
	const { setFieldValue } = useFormikContext();

	const handleChange = (v: MultiValue<SelectOption>, _actionMeta: ActionMeta<SelectOption>) => {
		const doms = v?.map((i: SelectOption) => {
			return i.value;
		});
		setFieldValue(name, doms);
	};

	const helperTexts: string[] = [];
	if (maxDomains) {
		helperTexts.push(intl.formatMessage({ id: "domain-names.max" }, { count: maxDomains }));
	}
	if (!isWildcardPermitted) {
		helperTexts.push(intl.formatMessage({ id: "domain-names.wildcards-not-permitted" }));
	} else if (!dnsProviderWildcardSupported) {
		helperTexts.push(intl.formatMessage({ id: "domain-names.wildcards-not-supported" }));
	}

	return (
		<Field name={name} validate={validateDomains(isWildcardPermitted && dnsProviderWildcardSupported, maxDomains)}>
			{({ field, form }: any) => (
				<div className="mb-3">
					<label className="form-label" htmlFor={id}>
						{intl.formatMessage({ id: label })}
					</label>
					<CreatableSelect
						className="react-select-container"
						classNamePrefix="react-select"
						name={field.name}
						id={id}
						closeMenuOnSelect={true}
						isClearable={false}
						isValidNewOption={validateDomain(isWildcardPermitted && dnsProviderWildcardSupported)}
						isMulti
						placeholder={intl.formatMessage({ id: "domain-names.placeholder" })}
						onChange={handleChange}
						value={field.value?.map((d: string) => ({ label: d, value: d }))}
					/>
					{form.errors[field.name] && form.touched[field.name] ? (
						<small className="text-danger">{form.errors[field.name]}</small>
					) : helperTexts.length ? (
						helperTexts.map((i) => (
							<small key={i} className="text-info">
								{i}
							</small>
						))
					) : null}
				</div>
			)}
		</Field>
	);
}
