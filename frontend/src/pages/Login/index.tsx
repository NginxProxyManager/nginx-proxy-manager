import React, { useState, ChangeEvent } from "react";

import { SinglePage } from "components";
import { useAuthState } from "context";
import styled from "styled-components";
import { Alert, Button, Container, Form, Card } from "tabler-react";

import logo from "../../img/logo-text-vertical-grey.png";

const Wrapper = styled(Container)`
	margin: 15px auto;
	max-width: 400px;
	display: block;
`;

const LogoWrapper = styled.div`
	text-align: center;
	padding-bottom: 15px;
`;

function Login() {
	const { login } = useAuthState();
	const [loading, setLoading] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");
	const [formData, setFormData] = useState({
		email: "",
		password: "",
	});

	const onSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		setErrorMessage("");

		try {
			await login(formData.email, formData.password);
		} catch ({ message }) {
			setErrorMessage(message);
			setLoading(false);
		}
	};

	const onChange = ({ target }: ChangeEvent<HTMLInputElement>) => {
		setFormData({ ...formData, [target.name]: target.value });
	};

	const formBody = (
		<>
			<Card.Title>Login</Card.Title>
			<Form method="post" type="card" onSubmit={onSubmit}>
				{errorMessage ? <Alert type="danger">{errorMessage}</Alert> : null}
				<Form.Group label="Email Address">
					<Form.Input
						onChange={onChange}
						name="email"
						type="email"
						value={formData.email}
						maxLength={150}
						disabled={loading}
						required
					/>
				</Form.Group>
				<Form.Group label="Password">
					<Form.Input
						onChange={onChange}
						name="password"
						type="password"
						value={formData.password}
						minLength={8}
						maxLength={100}
						disabled={loading}
						required
					/>
				</Form.Group>
				<Button color="cyan" loading={loading} block>
					Login
				</Button>
			</Form>
		</>
	);

	return (
		<SinglePage>
			<Wrapper>
				<LogoWrapper>
					<img src={logo} alt="Logo" />
				</LogoWrapper>
				<Card body={formBody} />
			</Wrapper>
		</SinglePage>
	);
}

export default Login;
