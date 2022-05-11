import {
	Button,
	FormControl,
	FormErrorMessage,
	FormLabel,
	Input,
	Modal,
	ModalOverlay,
	ModalContent,
	ModalHeader,
	ModalCloseButton,
	ModalBody,
	ModalFooter,
	Stack,
	useToast,
} from "@chakra-ui/react";
import { setAuth } from "api/npm";
import { PrettyButton } from "components";
import { Formik, Form, Field } from "formik";
import { intl } from "locale";
import { validateString } from "modules/Validations";

interface SetPasswordModalProps {
	userId: number;
	isOpen: boolean;
	onClose: () => void;
}
function SetPasswordModal({ userId, isOpen, onClose }: SetPasswordModalProps) {
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
			await setAuth(userId, {
				type: "password",
				secret: payload.password,
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
					{({ isSubmitting, values }: any) => (
						<Form>
							<ModalHeader>
								{intl.formatMessage({ id: "set-password" })}
							</ModalHeader>
							<ModalCloseButton />
							<ModalBody>
								<Stack spacing={4}>
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
								<PrettyButton mr={3} isLoading={isSubmitting}>
									{intl.formatMessage({ id: "form.save" })}
								</PrettyButton>
								<Button onClick={onClose} isLoading={isSubmitting}>
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

export { SetPasswordModal };
