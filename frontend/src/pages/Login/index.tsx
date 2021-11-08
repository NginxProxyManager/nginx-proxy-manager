import React, { useEffect, useRef, useState, ChangeEvent } from "react";

import {
	Flex,
	Box,
	FormControl,
	FormLabel,
	Input,
	Stack,
	Button,
	useColorModeValue,
	useToast,
	Link,
} from "@chakra-ui/react";
import { LocalePicker } from "components";
import { useAuthState } from "context";
import { intl } from "locale";

import { ThemeSwitcher } from "../../components/ThemeSwitcher";
import logo from "../../img/logo-256.png";

function Login() {
	const toast = useToast();
	const emailRef = useRef(null);
	const { login } = useAuthState();
	const [loading, setLoading] = useState(false);
	const [formData, setFormData] = useState({
		email: "",
		password: "",
	});

	const onSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);

		try {
			await login(formData.email, formData.password);
		} catch (err: any) {
			toast({
				title: "Login Error",
				description: err.message,
				status: "error",
				position: "top",
				duration: 3000,
				isClosable: true,
			});
			setLoading(false);
		}
	};

	const onChange = ({ target }: ChangeEvent<HTMLInputElement>) => {
		setFormData({ ...formData, [target.name]: target.value });
	};

	useEffect(() => {
		// @ts-expect-error ts-migrate(2531) FIXME: Object is possibly 'null'.
		emailRef.current.focus();
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
						<form onSubmit={onSubmit}>
							<Stack spacing={4}>
								<FormControl id="email">
									<FormLabel fontWeight={"bold"}>
										{intl.formatMessage({
											id: "user.email",
											defaultMessage: "Email",
										})}
									</FormLabel>
									<Input
										ref={emailRef}
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
								</FormControl>
								<FormControl id="password">
									<FormLabel fontWeight={"bold"}>
										{intl.formatMessage({
											id: "user.password",
											defaultMessage: "Password",
										})}
									</FormLabel>
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
										maxLength={100}
										autoComplete="off"
										required
									/>
								</FormControl>
								<Stack spacing={10}>
									<Box textAlign={"end"}>
										<Link color={"blue.400"}>Forgot password?</Link>
									</Box>
									<Button
										type="submit"
										loading={loading}
										bg={"blue.400"}
										color={"white"}
										_hover={{
											bg: "blue.500",
										}}>
										{intl.formatMessage({
											id: "login.login",
											defaultMessage: "Sign in",
										})}
									</Button>
								</Stack>
							</Stack>
						</form>
					</Box>
				</Stack>
			</Flex>
			<Box h={10} m={4} />
		</Flex>
	);
}

export default Login;
