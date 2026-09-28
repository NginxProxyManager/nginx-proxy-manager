import {
	Box,
	Center,
	Flex,
	FormControl,
	FormErrorMessage,
	FormLabel,
	Heading,
	Input,
	Select,
	Stack,
	Text,
	useColorModeValue,
	useToast,
} from "@chakra-ui/react";
import { useQueryClient } from "@tanstack/react-query";
import { Field, Form, Formik } from "formik";

import { DatabaseConfig, setupDatabase } from "src/api/npm";
import { LocalePicker, PrettyButton, ThemeSwitcher } from "src/components";
import { intl } from "src/locale";
import { validateNumber, validateString } from "src/modules/Validations";

interface Payload {
	driver: string;
	host: string;
	port: string;
	username: string;
	password: string;
	name: string;
	sslmode: string;
}

const defaultPorts: Record<string, string> = {
	postgres: "5432",
	mysql: "3306",
};

const sslModes = [
	"disable",
	"allow",
	"prefer",
	"require",
	"verify-ca",
	"verify-full",
];

function SetupDatabase() {
	const toast = useToast();
	const queryClient = useQueryClient();
	const mutedColor = useColorModeValue("gray.600", "gray.400");

	const onSubmit = async (values: Payload, { setSubmitting }: any) => {
		const payload: DatabaseConfig =
			values.driver === "sqlite"
				? { driver: values.driver }
				: {
						driver: values.driver,
						host: values.host,
						port: +values.port,
						username: values.username,
						password: values.password,
						name: values.name,
						...(values.driver === "postgres"
							? { sslmode: values.sslmode }
							: {}),
					};

		try {
			await setupDatabase(payload);
			// Trigger a Health change, which moves on to the user setup step
			await queryClient.refetchQueries({ queryKey: ["health"] });
		} catch (err: any) {
			toast({
				title: intl.formatMessage({ id: "setup-database.error" }),
				description: err.message,
				status: "error",
				position: "top",
				duration: 10000,
				isClosable: true,
			});
		}
		setSubmitting(false);
	};

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
								{intl.formatMessage({ id: "setup-database.title" })}
							</Heading>
							<Text color={mutedColor}>
								{intl.formatMessage({ id: "setup-database.description" })}
							</Text>
						</Stack>
						<Box mt={10}>
							<Formik
								initialValues={
									{
										driver: "sqlite",
										host: "",
										port: "",
										username: "",
										password: "",
										name: "",
										sslmode: "disable",
									} as Payload
								}
								onSubmit={onSubmit}>
								{({ isSubmitting, values, handleChange, setFieldValue }) => (
									<Form>
										<Stack spacing={4}>
											<Field name="driver">
												{({ field }: any) => (
													<FormControl isRequired>
														<FormLabel htmlFor="driver">
															{intl.formatMessage({
																id: "setup-database.driver",
															})}
														</FormLabel>
														<Select
															{...field}
															id="driver"
															onChange={(e: any) => {
																handleChange(e);
																// Swap the port along with the driver unless it's been customised
																if (
																	values.port === "" ||
																	Object.values(defaultPorts).includes(
																		values.port,
																	)
																) {
																	setFieldValue(
																		"port",
																		defaultPorts[e.target.value] || "",
																	);
																}
															}}>
															<option value="sqlite">SQLite</option>
															<option value="postgres">PostgreSQL</option>
															<option value="mysql">MySQL / MariaDB</option>
														</Select>
													</FormControl>
												)}
											</Field>
											{values.driver === "sqlite" ? (
												<Text fontSize="sm" color={mutedColor}>
													{intl.formatMessage({
														id: "setup-database.sqlite-description",
													})}
												</Text>
											) : (
												<>
													<Field name="host" validate={validateString(1, 255)}>
														{({ field, form }: any) => (
															<FormControl
																isRequired
																isInvalid={
																	form.errors.host && form.touched.host
																}>
																<FormLabel htmlFor="host">
																	{intl.formatMessage({
																		id: "setup-database.host",
																	})}
																</FormLabel>
																<Input {...field} id="host" autoFocus />
																<FormErrorMessage>
																	{form.errors.host}
																</FormErrorMessage>
															</FormControl>
														)}
													</Field>
													<Field
														name="port"
														validate={validateNumber(1, 65535)}>
														{({ field, form }: any) => (
															<FormControl
																isRequired
																isInvalid={
																	form.errors.port && form.touched.port
																}>
																<FormLabel htmlFor="port">
																	{intl.formatMessage({
																		id: "setup-database.port",
																	})}
																</FormLabel>
																<Input {...field} id="port" type="number" />
																<FormErrorMessage>
																	{form.errors.port}
																</FormErrorMessage>
															</FormControl>
														)}
													</Field>
													<Field name="name" validate={validateString(1, 255)}>
														{({ field, form }: any) => (
															<FormControl
																isRequired
																isInvalid={
																	form.errors.name && form.touched.name
																}>
																<FormLabel htmlFor="name">
																	{intl.formatMessage({
																		id: "setup-database.name",
																	})}
																</FormLabel>
																<Input {...field} id="name" />
																<FormErrorMessage>
																	{form.errors.name}
																</FormErrorMessage>
															</FormControl>
														)}
													</Field>
													<Field
														name="username"
														validate={validateString(1, 255)}>
														{({ field, form }: any) => (
															<FormControl
																isRequired
																isInvalid={
																	form.errors.username && form.touched.username
																}>
																<FormLabel htmlFor="username">
																	{intl.formatMessage({
																		id: "setup-database.username",
																	})}
																</FormLabel>
																<Input
																	{...field}
																	id="username"
																	autoComplete="off"
																/>
																<FormErrorMessage>
																	{form.errors.username}
																</FormErrorMessage>
															</FormControl>
														)}
													</Field>
													<Field name="password">
														{({ field }: any) => (
															<FormControl>
																<FormLabel htmlFor="password">
																	{intl.formatMessage({
																		id: "setup-database.password",
																	})}
																</FormLabel>
																<Input
																	{...field}
																	id="password"
																	type="password"
																	autoComplete="new-password"
																/>
															</FormControl>
														)}
													</Field>
													{values.driver === "postgres" ? (
														<Field name="sslmode">
															{({ field }: any) => (
																<FormControl isRequired>
																	<FormLabel htmlFor="sslmode">
																		{intl.formatMessage({
																			id: "setup-database.sslmode",
																		})}
																	</FormLabel>
																	<Select {...field} id="sslmode">
																		{sslModes.map((mode) => (
																			<option key={mode} value={mode}>
																				{mode}
																			</option>
																		))}
																	</Select>
																</FormControl>
															)}
														</Field>
													) : null}
												</>
											)}
										</Stack>
										<PrettyButton isLoading={isSubmitting} mt={8} w="full">
											{intl.formatMessage({ id: "setup-database.submit" })}
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

export default SetupDatabase;
