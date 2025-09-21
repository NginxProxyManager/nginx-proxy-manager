import { Field, useFormikContext } from "formik";
import type { ActionMeta, MultiValue } from "react-select";
import CreatableSelect from "react-select/creatable";
import { intl } from "src/locale";

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
	isWildcardPermitted,
	dnsProviderWildcardSupported,
}: Props) {
	const { values, setFieldValue } = useFormikContext();

	const getDomainCount = (v: string[] | undefined): number => {
		if (v?.length) {
			return v.length;
		}
		return 0;
	};

	const handleChange = (v: MultiValue<SelectOption>, _actionMeta: ActionMeta<SelectOption>) => {
		const doms = v?.map((i: SelectOption) => {
			return i.value;
		});
		setFieldValue(name, doms);
	};

	const isDomainValid = (d: string): boolean => {
		const dom = d.trim().toLowerCase();
		const v: any = values;

		// Deny if the list of domains is hit
		if (maxDomains && getDomainCount(v?.[name]) >= maxDomains) {
			return false;
		}

		if (dom.length < 3) {
			return false;
		}

		// Prevent wildcards
		if ((!isWildcardPermitted || !dnsProviderWildcardSupported) && dom.indexOf("*") !== -1) {
			return false;
		}

		// Prevent duplicate * in domain
		if ((dom.match(/\*/g) || []).length > 1) {
			return false;
		}

		// Prevent some invalid characters
		if ((dom.match(/(@|,|!|&|\$|#|%|\^|\(|\))/g) || []).length > 0) {
			return false;
		}

		// This will match *.com type domains,
		return dom.match(/\*\.[^.]+$/m) === null;
	};

	const helperTexts: string[] = [];
	if (maxDomains) {
		helperTexts.push(intl.formatMessage({ id: "domain_names.max" }, { count: maxDomains }));
	}
	if (!isWildcardPermitted) {
		helperTexts.push(intl.formatMessage({ id: "wildcards-not-permitted" }));
	} else if (!dnsProviderWildcardSupported) {
		helperTexts.push(intl.formatMessage({ id: "wildcards-not-supported" }));
	}

	return (
		<Field name={name}>
			{({ field, form }: any) => (
				<div className="mb-3">
					<label className="form-label" htmlFor={id}>
						{intl.formatMessage({ id: label })}
					</label>
					<CreatableSelect
						name={field.name}
						id={id}
						closeMenuOnSelect={true}
						isClearable={false}
						isValidNewOption={isDomainValid}
						isMulti
						placeholder="Start typing to add domain..."
						onChange={handleChange}
						value={field.value?.map((d: string) => ({ label: d, value: d }))}
					/>
					{form.errors[field.name] ? (
						<div className="invalid-feedback">
							{form.errors[field.name] && form.touched[field.name] ? form.errors[field.name] : null}
						</div>
					) : helperTexts.length ? (
						helperTexts.map((i) => (
							<div key={i} className="invalid-feedback text-info">
								{i}
							</div>
						))
					) : null}
				</div>
			)}
		</Field>
	);
}
