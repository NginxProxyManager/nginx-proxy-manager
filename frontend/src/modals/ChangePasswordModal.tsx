import {
	Button,
	FormControl,
	FormErrorMessage,
	FormLabel,
	Input,
	Modal,
	ModalBody,
	ModalCloseButton,
	ModalContent,
	ModalFooter,
	ModalHeader,
	ModalOverlay,
	Stack,
	useToast,
} from "@chakra-ui/react";
import { Field, Form, Formik } from "formik";

import { setAuth } from "src/api/npm";
import { PrettyButton } from "src/components";
import { intl } from "src/locale";
import { validateString } from "src/modules/Validations";

interface ChangePasswordModalProps {
	isOpen: boolean;
	onClose: () => void;
}
function ChangePasswordModal({ isOpen, onClose }: ChangePasswordModalProps) {
	const toast = useToast();

	const onSubmit = async (payload: any, { setSubmitting, setErrors }: any) => {
		const showErr = (msg: string) => {
			toast({
				description: intl.formatMessage({
					id: `error.${msg}`,
				}),
				status: "error",
				position: "top",
				duration: 3000,
				isClosable: true,
			});
		};

		try {
			await setAuth("me", {
				type: "local",
				secret: payload.password,
				currentSecret: payload.current,
			});
			onClose();
		} catch (err: any) {
			if (err.message === "current-password-invalid") {
				setErrors({
					current: intl.formatMessage({
						id: `error.${err.message}`,
					}),
				});
			} else {
				showErr(err.message);
			}
		}
		setSubmitting(false);
	};

	return (
		<Modal isOpen={isOpen} onClose={onClose} closeOnOverlayClick={false}>
			<ModalOverlay />
			<ModalContent>
				<Formik
					initialValues={{}}
					onSubmit={onSubmit}
					validate={(values: any) => {
						const errors = {} as any;
						if (values.password !== values.password2) {
							errors.password2 = "New passwords do not match";
						}
						return errors;
					}}>
					{({ isSubmitting }: any) => (
						<Form data-testid="change-password">
							<ModalHeader>
								{intl.formatMessage({ id: "change-password" })}
							</ModalHeader>
							<ModalCloseButton />
							<ModalBody>
								<Stack spacing={4}>
									<Field name="current" validate={validateString(8, 100)}>
										{({ field, form }: any) => (
											<FormControl
												isRequired
												isInvalid={form.errors.current && form.touched.current}>
												<FormLabel htmlFor="current">
													{intl.formatMessage({ id: "password.current" })}
												</FormLabel>
												<Input
													{...field}
													id="current"
													type="password"
													placeholder={intl.formatMessage({
														id: "password.current",
													})}
												/>
												<FormErrorMessage>
													{form.errors.current}
												</FormErrorMessage>
											</FormControl>
										)}
									</Field>
									<Field name="password" validate={validateString(8, 100)}>
										{({ field, form }: any) => (
											<FormControl
												isRequired
												isInvalid={
													form.errors.password && form.touched.password
												}>
												<FormLabel htmlFor="password">
													{intl.formatMessage({ id: "password.new" })}
												</FormLabel>
												<Input
													{...field}
													id="password"
													type="password"
													placeholder={intl.formatMessage({
														id: "password.new",
													})}
												/>
												<FormErrorMessage>
													{form.errors.password}
												</FormErrorMessage>
											</FormControl>
										)}
									</Field>
									<Field name="password2" validate={validateString(8, 100)}>
										{({ field, form }: any) => (
											<FormControl
												isRequired
												isInvalid={
													form.errors.password2 && form.touched.password2
												}>
												<FormLabel htmlFor="password2">
													{intl.formatMessage({ id: "password.confirm" })}
												</FormLabel>
												<Input
													{...field}
													id="password2"
													type="password"
													placeholder={intl.formatMessage({
														id: "password.confirm",
													})}
												/>
												<FormErrorMessage>
													{form.errors.password2}
												</FormErrorMessage>
											</FormControl>
										)}
									</Field>
								</Stack>
							</ModalBody>
							<ModalFooter>
								<PrettyButton
									mr={3}
									isLoading={isSubmitting}
									data-testid="save">
									{intl.formatMessage({ id: "form.save" })}
								</PrettyButton>
								<Button
									onClick={onClose}
									isLoading={isSubmitting}
									data-testid="cancel">
									{intl.formatMessage({ id: "form.cancel" })}
								</Button>
							</ModalFooter>
						</Form>
					)}
				</Formik>
			</ModalContent>
		</Modal>
	);
}

export { ChangePasswordModal };
