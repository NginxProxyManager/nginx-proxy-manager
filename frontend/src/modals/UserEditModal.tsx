import { useEffect, useState } from "react";

import {
	Button,
	Checkbox,
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
	Tab,
	TabList,
	TabPanel,
	TabPanels,
	Tabs,
	useToast,
} from "@chakra-ui/react";
import { Field, Form, Formik } from "formik";

import {
	AdminPermissionSelector,
	PermissionSelector,
	PrettyButton,
} from "src/components";
import { useSetUser, useUser } from "src/hooks";
import { intl } from "src/locale";
import { validateEmail, validateString } from "src/modules/Validations";

interface UserEditModalProps {
	userId: number;
	isOpen: boolean;
	onClose: () => void;
}
function UserEditModal({ userId, isOpen, onClose }: UserEditModalProps) {
	const toast = useToast();
	const { status, data } = useUser(userId);
	const { mutate: setUser } = useSetUser();

	const [capabilities, setCapabilities] = useState(data?.capabilities || []);
	const [capabilityOption, setCapabilityOption] = useState(
		data?.capabilities?.indexOf("full-admin") === -1 ? "restricted" : "admin",
	);

	useEffect(() => {
		setCapabilities(data?.capabilities || []);
		setCapabilityOption(
			data?.capabilities?.indexOf("full-admin") === -1 ? "restricted" : "admin",
		);
	}, [data]);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		const { ...payload } = {
			id: userId,
			...values,
			...{
				capabilities,
			},
		};

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

	const resetForm = () => {
		setCapabilityOption("admin");
		setCapabilities(["full-admin"]);
	};

	return (
		<Modal
			isOpen={isOpen}
			onClose={() => {
				resetForm();
				onClose();
			}}
			closeOnOverlayClick={false}>
			<ModalOverlay />
			<ModalContent>
				{status === "pending" ? (
					// todo nicer
					<p>loading</p>
				) : (
					<Formik
						initialValues={
							{
								name: data?.name,
								email: data?.email,
								isDisabled: data?.isDisabled,
							} as any
						}
						onSubmit={onSubmit}>
						{({ isSubmitting }) => (
							<Form>
								<ModalHeader>
									{intl.formatMessage({ id: "user.edit" })}
								</ModalHeader>
								<ModalCloseButton />
								<ModalBody>
									<Tabs>
										<TabList>
											<Tab>{intl.formatMessage({ id: "profile.title" })}</Tab>
											<Tab>
												{intl.formatMessage({ id: "permissions.title" })}
											</Tab>
										</TabList>
										<TabPanels>
											<TabPanel>
												<Stack spacing={4}>
													<Field name="name" validate={validateString(2, 50)}>
														{({ field, form }: any) => (
															<FormControl
																isRequired
																isInvalid={
																	form.errors.name && form.touched.name
																}>
																<FormLabel htmlFor="name">
																	{intl.formatMessage({ id: "user.name" })}
																</FormLabel>
																<Input
																	{...field}
																	id="name"
																	placeholder={intl.formatMessage({
																		id: "user.name",
																	})}
																/>
																<FormErrorMessage>
																	{form.errors.name}
																</FormErrorMessage>
															</FormControl>
														)}
													</Field>
													<Field name="email" validate={validateEmail()}>
														{({ field, form }: any) => (
															<FormControl
																isRequired
																isInvalid={
																	form.errors.email && form.touched.email
																}>
																<FormLabel htmlFor="email">
																	{intl.formatMessage({ id: "user.email" })}
																</FormLabel>
																<Input
																	{...field}
																	id="email"
																	type="email"
																	placeholder={intl.formatMessage({
																		id: "user.email",
																	})}
																/>
																<FormErrorMessage>
																	{form.errors.email}
																</FormErrorMessage>
															</FormControl>
														)}
													</Field>
													<Field name="isDisabled" type="checkbox">
														{({ field, form }: any) => (
															<FormControl
																isInvalid={
																	form.errors.isDisabled &&
																	form.touched.isDisabled
																}>
																<Checkbox
																	{...field}
																	isChecked={field.checked}
																	size="md"
																	colorScheme="red">
																	{intl.formatMessage({
																		id: "user.disabled",
																	})}
																</Checkbox>
																<FormErrorMessage>
																	{form.errors.isDisabled}
																</FormErrorMessage>
															</FormControl>
														)}
													</Field>
												</Stack>
											</TabPanel>
											<TabPanel>
												<AdminPermissionSelector
													selected={capabilityOption === "admin"}
													onClick={() => {
														setCapabilityOption("admin");
														setCapabilities(["full-admin"]);
													}}
												/>
												<PermissionSelector
													onClick={() => {
														if (capabilityOption === "admin") {
															setCapabilities([]);
														}
														setCapabilityOption("restricted");
													}}
													onChange={setCapabilities}
													capabilities={capabilities}
													selected={capabilityOption === "restricted"}
												/>
											</TabPanel>
										</TabPanels>
									</Tabs>
								</ModalBody>
								<ModalFooter>
									<PrettyButton mr={3} isLoading={isSubmitting}>
										{intl.formatMessage({ id: "form.save" })}
									</PrettyButton>
									<Button
										onClick={() => {
											resetForm();
											onClose();
										}}
										isLoading={isSubmitting}>
										{intl.formatMessage({ id: "form.cancel" })}
									</Button>
								</ModalFooter>
							</Form>
						)}
					</Formik>
				)}
			</ModalContent>
		</Modal>
	);
}

export { UserEditModal };
