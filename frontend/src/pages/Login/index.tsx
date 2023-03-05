import { useEffect, useRef } from "react";

import {
	Center,
	Flex,
	Box,
	FormControl,
	FormErrorMessage,
	FormLabel,
	Input,
	Stack,
	useColorModeValue,
	useToast,
} from "@chakra-ui/react";
import { LocalePicker, PrettyButton, ThemeSwitcher } from "components";
import { useAuthState } from "context";
import { Formik, Form, Field } from "formik";
import { intl } from "locale";
import { validateEmail, validateString } from "modules/Validations";

import logo from "../../img/logo-256.png";

function Login() {
	const toast = useToast();
	const emailRef = useRef(null);
	const { login } = useAuthState();

	const onSubmit = async (values: any, { setSubmitting }: any) => {
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
			await login(values.email, values.password);
		} catch (err) {
			if (err instanceof Error) {
				showErr(err.message);
			}
		}
		setSubmitting(false);
	};

	useEffect(() => {
		// @ts-expect-error ts-migrate(2531) FIXME: Object is possibly 'null'.
		emailRef.current.focus();
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
							<img src={logo} width={100} alt="Logo" />
						</Center>
					</Box>
					<Box
						rounded="lg"
						bg={useColorModeValue("white", "gray.700")}
						boxShadow="lg"
						p={8}>
						<Formik
							initialValues={
								{
									email: "",
									password: "",
								} as any
							}
							onSubmit={onSubmit}>
							{({ isSubmitting }) => (
								<Form>
									<Stack spacing={4}>
										<Field name="email" validate={validateEmail()}>
											{({ field, form }: any) => (
												<FormControl
													isRequired
													isInvalid={form.errors.email && form.touched.email}>
													<FormLabel htmlFor="email" fontWeight="bold">
														{intl.formatMessage({ id: "user.email" })}
													</FormLabel>
													<Input
														{...field}
														ref={emailRef}
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
													<FormLabel fontWeight="bold" htmlFor="password">
														{intl.formatMessage({
															id: "user.password",
														})}
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
										<Stack spacing={10}>
											{/*
									<Box textAlign="end">
										<Link color="blue.400">
											{intl.formatMessage({
												id: "login.forgot",
											})}
										</Link>
									</Box>
									*/}
											<PrettyButton mt={8} w="full" isLoading={isSubmitting}>
												{intl.formatMessage({
													id: "login.login",
												})}
											</PrettyButton>
										</Stack>
									</Stack>
								</Form>
							)}
						</Formik>
					</Box>
				</Stack>
			</Flex>
			<Box h={10} m={4} />
		</Flex>
	);
}

export default Login;
