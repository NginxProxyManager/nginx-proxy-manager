import React, { useEffect, useRef, useState, ChangeEvent } from "react";

import {
	Box,
	Flex,
	Stack,
	Heading,
	Input,
	Button,
	useColorModeValue,
	useToast,
} from "@chakra-ui/react";
import { createUser } from "api/npm";
import { LocalePicker, ThemeSwitcher } from "components";
import { useAuthState, useHealthState } from "context";
import { intl } from "locale";

import logo from "../../img/logo-256.png";

function Setup() {
	const toast = useToast();
	const nameRef = useRef(null);
	const { refreshHealth } = useHealthState();
	const { login } = useAuthState();
	const [loading, setLoading] = useState(false);

	const [formData, setFormData] = useState({
		name: "",
		nickname: "",
		email: "",
		password: "",
	});

	const onSubmit = async (e: React.FormEvent) => {
		console.log("HERE");
		e.preventDefault();
		setLoading(true);

		const { password, ...payload } = {
			...formData,
			...{
				isDisabled: false,
				roles: ["admin"],
				auth: {
					type: "password",
					secret: formData.password,
				},
			},
		};

		const showErr = (msg: string) => {
			toast({
				description: intl.formatMessage({
					id: `error.${msg}`,
					defaultMessage: msg,
				}),
				status: "error",
				position: "top",
				duration: 3000,
				isClosable: true,
			});
		};

		try {
			const response = await createUser({ payload });
			if (response && typeof response.id !== "undefined" && response.id) {
				// Success, Login using creds
				try {
					await login(response.email, password);
					// Trigger a Health change
					refreshHealth();
					// window.location.reload();
				} catch (err: any) {
					showErr(err.message);
					setLoading(false);
				}
			} else {
				showErr("cannot_create_user");
			}
		} catch (err: any) {
			showErr(err.message);
		}
		setLoading(false);
	};

	const onChange = ({ target }: ChangeEvent<HTMLInputElement>) => {
		setFormData({ ...formData, [target.name]: target.value });
	};

	useEffect(() => {
		// @ts-expect-error ts-migrate(2531) FIXME: Object is possibly 'null'.
		nameRef.current.focus();
	}, []);

	return (
		<Flex
			minH={"100vh"}
			w={"100vw"}
			flexDir={"column"}
			bg={useColorModeValue("gray.50", "gray.800")}>
			<Stack h={10} m={4} justify={"end"} direction={"row"}>
				<ThemeSwitcher />
				<LocalePicker className="text-right" />
			</Stack>

			<Flex align={"center"} justify={"center"} flex={"1"}>
				<Stack spacing={8} mx={"auto"} maxW={"md"} w={"full"} py={4} px={6}>
					<Box align={"center"}>
						<img src={logo} width={100} alt="Logo" />
					</Box>
					<Box
						rounded={"lg"}
						bg={useColorModeValue("white", "gray.700")}
						boxShadow={"lg"}
						p={8}>
						<Stack spacing={4}>
							<Heading
								color={useColorModeValue("gray.800", "gray.300")}
								lineHeight={1.1}
								fontSize={{ base: "1xl", sm: "2xl", md: "3xl" }}>
								{intl.formatMessage({
									id: "setup.title",
									defaultMessage: "Create your first Account",
								})}
							</Heading>
						</Stack>
						<Box mt={10}>
							<form onSubmit={onSubmit}>
								<Stack spacing={4}>
									<Input
										ref={nameRef}
										onChange={onChange}
										name="name"
										value={formData.name}
										disabled={loading}
										placeholder={intl.formatMessage({
											id: "user.name",
											defaultMessage: "Name",
										})}
										maxLength={50}
										required
									/>
									<Input
										onChange={onChange}
										name="nickname"
										value={formData.nickname}
										disabled={loading}
										placeholder={intl.formatMessage({
											id: "user.nickname",
											defaultMessage: "Nickname",
										})}
										maxLength={50}
										required
									/>
									<Input
										type="email"
										onChange={onChange}
										name="email"
										value={formData.email}
										disabled={loading}
										placeholder={intl.formatMessage({
											id: "user.email",
											defaultMessage: "Email",
										})}
										maxLength={150}
										required
									/>
									<Input
										type="password"
										onChange={onChange}
										name="password"
										value={formData.password}
										disabled={loading}
										placeholder={intl.formatMessage({
											id: "user.password",
											defaultMessage: "Password",
										})}
										minLength={8}
										maxLength={100}
										required
									/>
								</Stack>
								<Button
									type="submit"
									fontFamily={"heading"}
									mt={8}
									w={"full"}
									bgGradient="linear(to-r, red.400,pink.400)"
									color={"white"}
									disabled={loading}
									_hover={{
										bgGradient: "linear(to-r, red.400,pink.400)",
										boxShadow: "xl",
									}}>
									{intl.formatMessage({
										id: "setup.create",
										defaultMessage: "Create Account",
									})}
								</Button>
							</form>
						</Box>
					</Box>
				</Stack>
			</Flex>
			<Box h={10} m={4} />
		</Flex>
	);
}

export default Setup;
