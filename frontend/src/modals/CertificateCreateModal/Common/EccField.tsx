import {
	FormControl,
	FormErrorMessage,
	FormLabel,
	Switch,
} from "@chakra-ui/react";
import { Field } from "formik";

import { intl } from "src/locale";

const fieldName = "isEcc";

function EccField() {
	return (
		<Field name={fieldName}>
			{({ field, form }: any) => (
				<FormControl
					isInvalid={form.errors[fieldName] && form.touched[fieldName]}>
					<FormLabel htmlFor={fieldName}>
						{intl.formatMessage({
							id: "is-ecc",
						})}
					</FormLabel>
					<Switch {...field} id={fieldName} />
					<FormErrorMessage>{form.errors[fieldName]}</FormErrorMessage>
				</FormControl>
			)}
		</Field>
	);
}

export { EccField };
