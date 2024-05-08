import { useState } from "react";

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
	Tab,
	Tabs,
	TabList,
	TabPanel,
	TabPanels,
	useToast,
} from "@chakra-ui/react";
import { useQueryClient } from "@tanstack/react-query";
import { Formik, Form, Field } from "formik";

import { createUser } from "src/api/npm";
import {
	AdminPermissionSelector,
	PermissionSelector,
	PrettyButton,
} from "src/components";
import { intl } from "src/locale";
import { validateEmail, validateString } from "src/modules/Validations";

interface Payload {
	name: string;
	nickname: string;
	email: string;
	password: string;
}

interface UserCreateModalProps {
	isOpen: boolean;
	onClose: () => void;
}
function UserCreateModal({ isOpen, onClose }: UserCreateModalProps) {
	const toast = useToast();
	const queryClient = useQueryClient();
	const [capabilities, setCapabilities] = useState(["full-admin"]);
	const [capabilityOption, setCapabilityOption] = useState("admin");

	const onSubmit = async (values: Payload, { setSubmitting }: any) => {
		const { ...payload } = {
			...values,
			...{
				isDisabled: false,
				auth: {
					type: "password",
					secret: values.password,
				},
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

		try {
			const response = await createUser(payload);
			if (response && typeof response.id !== "undefined" && response.id) {
				// ok
				queryClient.invalidateQueries({ queryKey: ["users"] });
				onClose();
				resetForm();
			} else {
				showErr("cannot_create_user");
			}
		} catch (err: any) {
			showErr(err.message);
		}
		setSubmitting(false);
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
				<Formik
					initialValues={
						{
							name: "",
							nickname: "",
							email: "",
							password: "",
						} as Payload
					}
					onSubmit={onSubmit}>
					{({ isSubmitting }) => (
						<Form>
							<ModalHeader>
								{intl.formatMessage({ id: "user.create" })}
							</ModalHeader>
							<ModalCloseButton />
							<ModalBody>
								<Tabs>
									<TabList>
										<Tab>{intl.formatMessage({ id: "profile.title" })}</Tab>
										<Tab>{intl.formatMessage({ id: "permissions.title" })}</Tab>
									</TabList>
									<TabPanels>
										<TabPanel>
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
												<Field
													name="nickname"
													validate={validateString(2, 100)}>
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
												<Field
													name="password"
													validate={validateString(8, 255)}>
													{({ field, form }: any) => (
														<FormControl
															isRequired
															isInvalid={
																form.errors.password && form.touched.password
															}>
															<FormLabel htmlFor="password">
																{intl.formatMessage({ id: "user.password" })}
															</FormLabel>
															<Input
																{...field}
																id="password"
																type="password"
																placeholder={intl.formatMessage({
																	id: "user.password",
																})}
															/>
															<FormErrorMessage>
																{form.errors.password}
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
			</ModalContent>
		</Modal>
	);
}

export { UserCreateModal };
