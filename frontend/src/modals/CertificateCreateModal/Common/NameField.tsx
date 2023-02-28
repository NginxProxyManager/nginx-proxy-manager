import {
	FormControl,
	FormErrorMessage,
	FormLabel,
	Input,
} from "@chakra-ui/react";
import { Field } from "formik";
import { intl } from "locale";
import { validateString } from "modules/Validations";

function NameField() {
	return (
		<Field name="name" validate={validateString(1, 100)}>
			{({ field, form }: any) => (
				<FormControl
					isRequired
					isInvalid={form.errors.name && form.touched.name}>
					<FormLabel htmlFor="name">
						{intl.formatMessage({
							id: "name",
						})}
					</FormLabel>
					<Input
						{...field}
						id="name"
						placeholder={intl.formatMessage({
							id: "name",
						})}
					/>
					<FormErrorMessage>{form.errors.name}</FormErrorMessage>
				</FormControl>
			)}
		</Field>
	);
}

export { NameField };
