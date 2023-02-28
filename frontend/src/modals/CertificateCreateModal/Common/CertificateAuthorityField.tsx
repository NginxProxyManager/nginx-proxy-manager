import {
	FormControl,
	FormErrorMessage,
	FormLabel,
	Select,
} from "@chakra-ui/react";
import { CertificateAuthority } from "api/npm";
import { Field, useFormikContext } from "formik";
import { useCertificateAuthorities } from "hooks";
import { intl } from "locale";

const fieldName = "certificateAuthorityId";

interface CertificateAuthorityFieldProps {
	onChange?: (maxDomains: number, isWildcardSupported: boolean) => any;
}
function CertificateAuthorityField({
	onChange,
}: CertificateAuthorityFieldProps) {
	const { setFieldValue } = useFormikContext();
	const { data, isLoading } = useCertificateAuthorities(0, 999, [{ id: "id" }]);

	const handleOnChange = (e: any) => {
		if (e.currentTarget.value) {
			const id = parseInt(e.currentTarget.value, 10);
			// This step enforces that the formik payload has a
			// string number instead of a string as the value
			// for this field
			setFieldValue(fieldName, id);
			if (onChange) {
				// find items in list of data
				const ca = data?.items.find((item) => item.id === id);
				if (ca) {
					onChange(ca.maxDomains, ca.isWildcardSupported);
				} else {
					onChange(0, false);
				}
			}
		}
	};

	return (
		<Field name={fieldName}>
			{({ field, form }: any) => (
				<FormControl
					isRequired
					isInvalid={form.errors[fieldName] && form.touched[fieldName]}>
					<FormLabel htmlFor={fieldName}>
						{intl.formatMessage({
							id: "certificate-authority",
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
						{data?.items?.map((item: CertificateAuthority) => {
							return (
								<option key={item.id} value={item.id}>
									{item.name}
								</option>
							);
						})}
					</Select>
					<FormErrorMessage>{form.errors[fieldName]}</FormErrorMessage>
				</FormControl>
			)}
		</Field>
	);
}

export { CertificateAuthorityField };
