import {
	Popover,
	PopoverTrigger,
	PopoverContent,
	PopoverArrow,
	IconButton,
	FormControl,
	FormErrorMessage,
	Input,
	Stack,
	ButtonGroup,
	Button,
	useDisclosure,
	Select,
} from "@chakra-ui/react";
import { Formik, Form, Field } from "formik";
import FocusLock from "react-focus-lock";
import { FiFilter } from "react-icons/fi";

import { PrettyButton } from "src/components";
import { intl } from "src/locale";
import { validateString } from "src/modules/Validations";

function TextFilter({ column: { filterValue, setFilter } }: any) {
	const { onOpen, onClose, isOpen } = useDisclosure();

	const onSubmit = (values: any, { setSubmitting }: any) => {
		setFilter(values);
		setSubmitting(false);
		onClose();
	};

	const clearFilter = () => {
		setFilter(undefined);
		onClose();
	};

	const isFiltered = (): boolean => {
		return !(typeof filterValue === "undefined" || filterValue === "");
	};

	return (
		<Popover
			isOpen={isOpen}
			onOpen={onOpen}
			onClose={onClose}
			placement="right">
			<PopoverTrigger>
				<IconButton
					variant="unstyled"
					size="sm"
					color={isFiltered() ? "orange.400" : ""}
					icon={<FiFilter />}
					aria-label="Filter"
				/>
			</PopoverTrigger>
			<PopoverContent p={5}>
				<FocusLock returnFocus persistentFocus={false}>
					<PopoverArrow />
					<Formik
						initialValues={
							{
								modifier: filterValue?.modifier || "contains",
								value: filterValue?.value,
							} as any
						}
						onSubmit={onSubmit}>
						{({ isSubmitting }) => (
							<Form>
								<Stack spacing={4}>
									<Field name="modifier">
										{({ field, form }: any) => (
											<FormControl
												isRequired
												isInvalid={
													form.errors.modifier && form.touched.modifier
												}>
												<Select
													{...field}
													size="sm"
													id="modifier"
													defaultValue="contains">
													<option value="contains">
														{intl.formatMessage({ id: "filter.contains" })}
													</option>
													<option value="equals">
														{intl.formatMessage({ id: "filter.exactly" })}
													</option>
													<option value="starts">
														{intl.formatMessage({ id: "filter.starts" })}
													</option>
													<option value="ends">
														{intl.formatMessage({ id: "filter.ends" })}
													</option>
												</Select>
												<FormErrorMessage>{form.errors.name}</FormErrorMessage>
											</FormControl>
										)}
									</Field>
									<Field name="value" validate={validateString(1, 50)}>
										{({ field, form }: any) => (
											<FormControl
												isRequired
												isInvalid={form.errors.value && form.touched.value}>
												<Input
													{...field}
													size="sm"
													placeholder={intl.formatMessage({
														id: "filter.placeholder",
													})}
													autoComplete="off"
												/>
												<FormErrorMessage>{form.errors.value}</FormErrorMessage>
											</FormControl>
										)}
									</Field>
									<ButtonGroup display="flex" justifyContent="flex-end">
										<Button
											size="sm"
											variant="outline"
											onClick={clearFilter}
											isLoading={isSubmitting}>
											{intl.formatMessage({
												id: "filter.clear",
											})}
										</Button>
										<PrettyButton size="sm" isLoading={isSubmitting}>
											{intl.formatMessage({
												id: "filter.apply",
											})}
										</PrettyButton>
									</ButtonGroup>
								</Stack>
							</Form>
						)}
					</Formik>
				</FocusLock>
			</PopoverContent>
		</Popover>
	);
}

export { TextFilter };
