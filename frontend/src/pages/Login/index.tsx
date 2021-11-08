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
} from "@chakra-ui/react";
import { LocalePicker } from "components";
import { useAuthState } from "context";
import { intl } from "locale";

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
			align={"center"}
			justify={"center"}
			bg={useColorModeValue("gray.50", "gray.800")}>
			<Stack spacing={8} mx={"auto"} maxW={"lg"} py={12} px={6}>
				<Stack align={"center"}>
					<img src={logo} width={100} alt="Logo" />
				</Stack>
				<Box
					rounded={"lg"}
					bg={useColorModeValue("white", "gray.700")}
					boxShadow={"lg"}
					p={8}>
					<LocalePicker className="text-right" />
					<Stack spacing={4}>
						<form onSubmit={onSubmit}>
							<FormControl id="email">
								<FormLabel>
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
								<FormLabel>
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
								<Stack
									direction={{ base: "column", sm: "row" }}
									align={"start"}
									justify={"space-between"}
								/>
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
						</form>
					</Stack>
				</Box>
			</Stack>
		</Flex>
	);
}

export default Login;
