import React, { useState, ChangeEvent } from "react";

import { Alert, Button } from "components";
import { useAuthState } from "context";

import logo from "../../img/logo-text-vertical-grey.png";

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
		} catch (err: any) {
			setErrorMessage(err.message);
			setLoading(false);
		}
	};

	const onChange = ({ target }: ChangeEvent<HTMLInputElement>) => {
		setFormData({ ...formData, [target.name]: target.value });
	};

	return (
		<div className="container-tight py-4">
			<div className="text-center mb-4">
				<img src={logo} alt="Logo" />
			</div>
			<form
				className="card card-md"
				method="post"
				autoComplete="off"
				onSubmit={onSubmit}>
				<div className="card-body">
					{errorMessage ? <Alert type="danger">{errorMessage}</Alert> : null}
					<div className="mb-3">
						<label className="form-label">Email address</label>
						<input
							type="email"
							onChange={onChange}
							className="form-control"
							name="email"
							value={formData.email}
							disabled={loading}
							placeholder="Email"
							maxLength={150}
							required
						/>
					</div>
					<div className="mb-2">
						<label className="form-label">Password</label>
						<div className="input-group input-group-flat">
							<input
								type="password"
								onChange={onChange}
								className="form-control"
								name="password"
								value={formData.password}
								disabled={loading}
								placeholder="Password"
								minLength={8}
								maxLength={100}
								autoComplete="off"
								required
							/>
						</div>
					</div>
					<div className="form-footer">
						<Button color="cyan" loading={loading} className="w-100">
							Sign in
						</Button>
					</div>
				</div>
			</form>
		</div>
	);
}

export default Login;
