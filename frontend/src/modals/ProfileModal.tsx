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
import { PrettyButton } from "components";
import { Formik, Form, Field } from "formik";
import { useUser, useSetUser } from "hooks";
import { intl } from "locale";
import { validateEmail, validateString } from "modules/Validations";

interface ProfileModalProps {
	isOpen: boolean;
	onClose: () => void;
}
function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
	const toast = useToast();
	const user = useUser("me");
	const { mutate: setUser } = useSetUser();

	const onSubmit = (payload: any, { setSubmitting }: any) => {
		payload.id = "me";

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

		setUser(payload, {
			onError: (err: any) => showErr(err.message),
			onSuccess: () => onClose(),
			onSettled: () => setSubmitting(false),
		});
	};

	return (
		<Modal isOpen={isOpen} onClose={onClose} closeOnOverlayClick={false}>
			<ModalOverlay />
			<ModalContent>
				<Formik
					initialValues={{
						name: user.data?.name,
						nickname: user.data?.nickname,
						email: user.data?.email,
					}}
					onSubmit={onSubmit}>
					{({ isSubmitting, values }: any) => (
						<Form>
							<ModalHeader>
								{intl.formatMessage({ id: "profile.title" })}
							</ModalHeader>
							<ModalCloseButton />
							<ModalBody>
								<Stack spacing={4}>
									<Field name="name" validate={validateString(2, 100)}>
										{({ field, form }: any) => (
											<FormControl
												isRequired
												isInvalid={form.errors.name && form.touched.name}>
												<FormLabel htmlFor="name">
													{intl.formatMessage({ id: "user.name" })}
												</FormLabel>
												<Input
													{...field}
													id="name"
													defaultValue={values.name}
													placeholder={intl.formatMessage({
														id: "user.name",
													})}
												/>
												<FormErrorMessage>{form.errors.name}</FormErrorMessage>
											</FormControl>
										)}
									</Field>
									<Field name="nickname" validate={validateString(2, 100)}>
										{({ field, form }: any) => (
											<FormControl
												isRequired
												isInvalid={
													form.errors.nickname && form.touched.nickname
												}>
												<FormLabel htmlFor="nickname">
													{intl.formatMessage({ id: "user.nickname" })}
												</FormLabel>
												<Input
													{...field}
													id="nickname"
													defaultValue={values.nickname}
													placeholder={intl.formatMessage({
														id: "user.nickname",
													})}
												/>
												<FormErrorMessage>
													{form.errors.nickname}
												</FormErrorMessage>
											</FormControl>
										)}
									</Field>
									<Field name="email" validate={validateEmail()}>
										{({ field, form }: any) => (
											<FormControl
												isRequired
												isInvalid={form.errors.email && form.touched.email}>
												<FormLabel htmlFor="email">
													{intl.formatMessage({ id: "user.email" })}
												</FormLabel>
												<Input
													{...field}
													id="email"
													type="email"
													defaultValue={values.email}
													placeholder={intl.formatMessage({
														id: "user.email",
													})}
												/>
												<FormErrorMessage>{form.errors.email}</FormErrorMessage>
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

export { ProfileModal };
