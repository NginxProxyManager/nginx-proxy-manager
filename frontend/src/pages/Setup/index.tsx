import { useEffect, useRef } from "react";

import {
	Box,
	Center,
	Flex,
	FormControl,
	FormErrorMessage,
	FormLabel,
	Stack,
	Heading,
	Input,
	useColorModeValue,
	useToast,
} from "@chakra-ui/react";
import { useQueryClient } from "@tanstack/react-query";
import { Formik, Form, Field } from "formik";

import { createUser } from "src/api/npm";
// import logo from "src/assets/logo-256.png";
import { LocalePicker, PrettyButton, ThemeSwitcher } from "src/components";
import { useAuthState } from "src/context";
import { intl } from "src/locale";
import { validateEmail, validateString } from "src/modules/Validations";

interface Payload {
	name: string;
	nickname: string;
	email: string;
	password: string;
}

function Setup() {
	const toast = useToast();
	const nameRef = useRef(null);
	const queryClient = useQueryClient();
	const { login } = useAuthState();

	const onSubmit = async (values: Payload, { setSubmitting }: any) => {
		const { password, ...payload } = {
			...values,
			...{
				isDisabled: false,
				auth: {
					type: "password",
					secret: values.password,
				},
				capabilities: ["full-admin"],
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
				try {
					await login(response.email, password);
					// Trigger a Health change
					await queryClient.refetchQueries(["health"]);
					// window.location.reload();
				} catch (err: any) {
					showErr(err.message);
				}
			} else {
				showErr("cannot_create_user");
			}
		} catch (err: any) {
			showErr(err.message);
		}
		setSubmitting(false);
	};

	useEffect(() => {
		// @ts-expect-error ts-migrate(2531) FIXME: Object is possibly 'null'.
		nameRef.current.focus();
	}, []);

	return (
		<Flex
			minH="100vh"
			w="100vw"
			flexDir="column"
			bg={useColorModeValue("gray.50", "gray.800")}>
			<Stack h={10} m={4} justify="end" direction="row">
				<ThemeSwitcher />
				<LocalePicker className="text-right" />
			</Stack>

			<Flex align="center" justify="center" flex="1">
				<Stack spacing={8} mx="auto" maxW="md" w="full" py={4} px={6}>
					<Box>
						<Center>
							<img src="/images/logo-256.png" width={100} alt="Logo" />
						</Center>
					</Box>
					<Box
						rounded="lg"
						bg={useColorModeValue("white", "gray.700")}
						boxShadow="lg"
						p={8}>
						<Stack spacing={4}>
							<Heading
								color={useColorModeValue("gray.800", "gray.300")}
								lineHeight={1.1}
								fontSize={{ base: "1xl", sm: "2xl", md: "3xl" }}>
								{intl.formatMessage({ id: "setup.title" })}
							</Heading>
						</Stack>
						<Box mt={10}>
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
															ref={nameRef}
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
											<Field name="password" validate={validateString(8, 255)}>
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
										<PrettyButton isLoading={isSubmitting} mt={8} w="full">
											{intl.formatMessage({ id: "setup.create" })}
										</PrettyButton>
									</Form>
								)}
							</Formik>
						</Box>
					</Box>
				</Stack>
			</Flex>
			<Box h={10} m={4} />
		</Flex>
	);
}

export default Setup;
