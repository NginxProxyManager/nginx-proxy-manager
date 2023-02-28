import {
	FormControl,
	FormErrorMessage,
	FormLabel,
	FormHelperText,
} from "@chakra-ui/react";
import { CreatableSelect, OptionBase } from "chakra-react-select";
import { Field, useFormikContext } from "formik";
import { intl } from "locale";

interface SelectOption extends OptionBase {
	label: string;
	value: string;
}
interface DomainNamesFieldProps {
	maxDomains?: number;
	isWildcardSupported?: boolean;
	onChange?: (i: string[]) => any;
}
function DomainNamesField({
	maxDomains,
	isWildcardSupported,
	onChange,
}: DomainNamesFieldProps) {
	const { values, setFieldValue } = useFormikContext();

	const getDomainCount = (v: string[] | undefined) => {
		if (typeof v !== "undefined" && v?.length) {
			return v.length;
		}
		return 0;
	};

	const isDomainValid = (d: string): boolean => {
		const dom = d.trim().toLowerCase();
		const v: any = values;

		// Deny if the list of domains is hit
		if (maxDomains && getDomainCount(v?.domainNames) >= maxDomains) {
			return false;
		}

		if (dom.length < 3) {
			return false;
		}

		// Prevent wildcards
		if (!isWildcardSupported && dom.indexOf("*") !== -1) {
			return false;
		}

		// Prevent duplicate * in domain
		if ((dom.match(/\*/g) || []).length > 1) {
			return false;
		}

		// Prevent some invalid characters
		// @ ,
		if ((dom.match(/(@|,)/g) || []).length > 0) {
			return false;
		}

		// This will match *.com type domains,
		return dom.match(/\*\.[^.]+$/m) === null;
	};

	const handleChange = (values: any) => {
		const doms = values?.map((i: SelectOption) => {
			return i.value;
		});
		setFieldValue("domainNames", doms);
	};

	return (
		<Field name="domainNames">
			{({ field, form }: any) => (
				<FormControl
					isInvalid={form.errors.domainNames && form.touched.domainNames}>
					<FormLabel htmlFor="domainNames">
						{intl.formatMessage({
							id: "domain_names",
						})}
					</FormLabel>
					<CreatableSelect
						name={field.domainNames}
						id="domainNames"
						closeMenuOnSelect={true}
						isClearable={false}
						onChange={handleChange}
						isValidNewOption={isDomainValid}
						isMulti
						placeholder="example.com"
					/>
					{maxDomains ? (
						<FormHelperText>
							{intl.formatMessage(
								{ id: "domain_names.max" },
								{ count: maxDomains },
							)}
						</FormHelperText>
					) : null}
					<FormErrorMessage>{form.errors.domainNames}</FormErrorMessage>
				</FormControl>
			)}
		</Field>
	);
}

export { DomainNamesField };
