import {
	FormControl,
	FormErrorMessage,
	FormLabel,
	Select,
} from "@chakra-ui/react";
import { DNSProvider } from "api/npm";
import { Field, useFormikContext } from "formik";
import { useDNSProviders } from "hooks";
import { intl } from "locale";

const fieldName = "dnsProviderId";

function DNSProviderField() {
	const { setFieldValue } = useFormikContext();
	const { data, isLoading } = useDNSProviders(0, 999);

	const handleOnChange = (e: any) => {
		if (e.currentTarget.value) {
			const id = parseInt(e.currentTarget.value, 10);
			// This step enforces that the formik payload has a
			// string number instead of a string as the value
			// for this field
			setFieldValue(fieldName, id);
		}
	};

	return (
		<Field name={fieldName}>
			{({ field, form }: any) => (
				<FormControl
					isRequired
					isInvalid={
						!isLoading &&
						(!data?.total ||
							(form.errors[fieldName] && form.touched[fieldName]))
					}>
					<FormLabel htmlFor={fieldName}>
						{intl.formatMessage({
							id: "dns-provider",
						})}
					</FormLabel>
					<Select
						{...field}
						id={fieldName}
						disabled={isLoading}
						onChange={(e: any) => {
							field.onChange(e);
							handleOnChange(e);
						}}>
						<option value="" />
						{data?.items?.map((item: DNSProvider) => {
							return (
								<option key={item.id} value={item.id}>
									{item.name}
								</option>
							);
						})}
					</Select>
					<FormErrorMessage>
						{!isLoading && !data?.total
							? intl.formatMessage({
									id: "dns-providers.empty",
							  })
							: form.errors[fieldName]}
					</FormErrorMessage>
				</FormControl>
			)}
		</Field>
	);
}

export { DNSProviderField };
