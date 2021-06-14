import React, { useState, ChangeEvent } from "react";

import { createUser } from "api/npm";
import { SinglePage } from "components";
import { useAuthState, useHealthState } from "context";
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

function Setup() {
	const { refreshHealth } = useHealthState();
	const { login } = useAuthState();
	const [loading, setLoading] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");
	const [formData, setFormData] = useState({
		name: "",
		nickname: "",
		email: "",
		password: "",
	});

	const onSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		setErrorMessage("");

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

		try {
			const response = await createUser({ payload });
			if (response && typeof response.id !== "undefined" && response.id) {
				// Success, Login using creds
				try {
					await login(response.email, password);
					// Trigger a Health change
					refreshHealth();

					// window.location.reload();
				} catch ({ message }) {
					setErrorMessage(message);
					setLoading(false);
				}
			} else {
				setErrorMessage("Unable to create user!");
			}
		} catch ({ message }) {
			setErrorMessage(message);
		}
		setLoading(false);
	};

	const onChange = ({ target }: ChangeEvent<HTMLInputElement>) => {
		setFormData({ ...formData, [target.name]: target.value });
	};

	const formBody = (
		<>
			<Card.Title>Initial Setup</Card.Title>
			<Form method="post" type="card" onSubmit={onSubmit}>
				{errorMessage ? <Alert type="danger">{errorMessage}</Alert> : null}
				<Form.Group label="Full Name">
					<Form.Input
						onChange={onChange}
						name="name"
						value={formData.name}
						disabled={loading}
						required
					/>
				</Form.Group>
				<Form.Group label="Nickname">
					<Form.Input
						onChange={onChange}
						name="nickname"
						value={formData.nickname}
						disabled={loading}
						required
					/>
				</Form.Group>
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
					Create Account
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

export default Setup;
