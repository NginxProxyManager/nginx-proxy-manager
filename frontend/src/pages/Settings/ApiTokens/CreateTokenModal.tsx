import { type FormEvent, useEffect, useRef, useState } from "react";
import { Alert, Modal } from "react-bootstrap";
import {
	type ApiToken,
	type ApiTokenOptions,
	type ApiTokenScope,
	apiTokenResources,
	createApiToken,
} from "src/api/backend/apiTokens";
import { Button } from "src/components";
import { intl, T } from "src/locale";
import styles from "./CreateTokenModal.module.css";

interface Props {
	options: ApiTokenOptions;
	onCreated: (token: ApiToken) => void;
	onClose: () => void;
	onRefresh: () => void;
}

export default function CreateTokenModal({ options, onCreated, onClose, onRefresh }: Props) {
	const [name, setName] = useState("");
	const [expiry, setExpiry] = useState(String(options.defaultExpiryDays));
	const [scopes, setScopes] = useState<ApiTokenScope[]>([]);
	const [password, setPassword] = useState("");
	const [code, setCode] = useState("");
	const [secret, setSecret] = useState("");
	const [copied, setCopied] = useState(false);
	const [copyError, setCopyError] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const pending = useRef(false);
	const mounted = useRef(false);
	const secretInput = useRef<HTMLInputElement>(null);

	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
			// The component owns the secret. No query cache, URL, or persistent store receives it.
			if (secretInput.current) secretInput.current.value = "";
		};
	}, []);

	const close = () => {
		if (pending.current) return;
		if (secretInput.current) secretInput.current.value = "";
		setSecret("");
		setPassword("");
		setCode("");
		setError(null);
		setCopied(false);
		setCopyError(false);
		onClose();
	};

	const selectScope = (resource: string, scope?: ApiTokenScope) => {
		setScopes((current) => [
			...current.filter((value) => !value.startsWith(`${resource}:`)),
			...(scope ? [scope] : []),
		]);
	};

	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (pending.current || secret) return;
		const days = Number(expiry);
		if (
			!name.trim() ||
			name.trim().length > 100 ||
			!scopes.length ||
			!Number.isInteger(days) ||
			days < 1 ||
			days > options.maxExpiryDays ||
			!password ||
			(options.requires2fa && !code.trim())
		)
			return;
		pending.current = true;
		setIsSubmitting(true);
		setError(null);
		try {
			const { token, ...metadata } = await createApiToken({
				name: name.trim(),
				expiresInDays: days,
				scopes,
				password,
				...(options.requires2fa ? { code: code.trim() } : {}),
			});
			if (!mounted.current) return;
			setSecret(token);
			onCreated(metadata);
		} catch (err) {
			if (!mounted.current) return;
			setError(err instanceof Error ? err.message : "api-tokens.create-failed");
			// Refresh the list in case the server committed creation before the connection failed.
			onRefresh();
		} finally {
			pending.current = false;
			if (mounted.current) {
				setPassword("");
				setCode("");
				setIsSubmitting(false);
			}
		}
	};

	const copy = async () => {
		setCopied(false);
		setCopyError(false);
		try {
			await navigator.clipboard.writeText(secret);
			if (mounted.current) setCopied(true);
		} catch {
			if (mounted.current) {
				setCopyError(true);
				secretInput.current?.select();
			}
		}
	};

	return (
		<Modal
			show
			onHide={close}
			backdrop="static"
			keyboard={!isSubmitting}
			scrollable
			aria-labelledby="api-token-create-title"
		>
			<Modal.Header closeButton={!isSubmitting} closeLabel={intl.formatMessage({ id: "api-tokens.close" })}>
				<Modal.Title id="api-token-create-title">
					<T id={secret ? "api-tokens.created" : "api-tokens.create"} />
				</Modal.Title>
			</Modal.Header>
			{secret ? (
				<>
					<Modal.Body>
						<Alert variant="warning">
							<T id="api-tokens.secret-warning" />
						</Alert>
						<label className="form-label" htmlFor="api-token-secret">
							<T id="api-tokens.secret" />
						</label>
						<input
							id="api-token-secret"
							ref={secretInput}
							className="form-control font-monospace"
							type="text"
							value={secret}
							readOnly
							autoComplete="off"
							spellCheck={false}
							onFocus={(event) => event.currentTarget.select()}
						/>
						<div className="mt-3">
							<Button onClick={copy}>
								<T id={copied ? "api-tokens.copied" : "api-tokens.copy"} />
							</Button>
						</div>
						{copyError && (
							<p className="text-danger mt-2" role="alert">
								<T id="api-tokens.copy-failed" />
							</p>
						)}
						<p className="text-muted mt-3 mb-0">
							<T id="api-tokens.usage" />
						</p>
					</Modal.Body>
					<Modal.Footer>
						<Button color="teal" onClick={close}>
							<T id="api-tokens.saved-secret" />
						</Button>
					</Modal.Footer>
				</>
			) : (
				<form className={styles.form} onSubmit={submit}>
					<Modal.Body>
						{error && (
							<Alert variant="danger">
								<T id={error} />
								<div className="mt-2">
									<T id="api-tokens.uncertain-create" />
								</div>
							</Alert>
						)}
						<fieldset disabled={isSubmitting}>
							<div className="row">
								<div className="col-sm-8 mb-3">
									<label className="form-label" htmlFor="api-token-name">
										<T id="api-tokens.name" />
									</label>
									<input
										id="api-token-name"
										className="form-control"
										value={name}
										onChange={(event) => setName(event.target.value)}
										maxLength={100}
										required
										autoComplete="off"
									/>
								</div>
								<div className="col-sm-4 mb-3">
									<label className="form-label" htmlFor="api-token-expiry">
										<T id="api-tokens.expiry-days" />
									</label>
									<input
										id="api-token-expiry"
										className="form-control"
										type="number"
										min={1}
										max={options.maxExpiryDays}
										step={1}
										value={expiry}
										onChange={(event) => setExpiry(event.target.value)}
										required
										aria-describedby="api-token-expiry-help"
									/>
									<div className="form-hint" id="api-token-expiry-help">
										<T id="api-tokens.expiry-help" data={{ max: options.maxExpiryDays }} />
									</div>
								</div>
							</div>
							<h3 className="form-label">
								<T id="api-tokens.scopes" />
							</h3>
							<p className="text-muted">
								<T id="api-tokens.scopes-help" />
							</p>
							<div className="mb-3">
								{apiTokenResources.map((resource) => {
									const read: ApiTokenScope = `${resource}:read`;
									const write: ApiTokenScope = `${resource}:write`;
									if (!options.scopes.includes(read) && !options.scopes.includes(write)) return null;
									return (
										<fieldset className="mb-2" key={resource}>
											<legend className="form-label mb-1">
												<T id={resource.replace(/_/g, "-")} />
											</legend>
											{([undefined, read, write] as const).map((scope) => {
												if (scope && !options.scopes.includes(scope)) return null;
												const mode = scope?.endsWith(":write")
													? "write"
													: scope
														? "read"
														: "none";
												return (
													<label className="form-check form-check-inline" key={mode}>
														<input
															className="form-check-input"
															type="radio"
															name={`api-token-${resource}`}
															checked={
																scope
																	? scopes.includes(scope)
																	: !scopes.some((value) =>
																			value.startsWith(`${resource}:`),
																		)
															}
															onChange={() => selectScope(resource, scope)}
														/>
														<span className="form-check-label">
															<T id={`api-tokens.scope-${mode}`} />
														</span>
													</label>
												);
											})}
										</fieldset>
									);
								})}
							</div>
							<Alert variant="warning">
								<T id="api-tokens.security-warning" />
							</Alert>
							<p>
								<T id={`api-tokens.visibility-${options.visibility}`} />
							</p>
							<div className="mb-3">
								<label className="form-label" htmlFor="api-token-password">
									<T id="api-tokens.password" />
								</label>
								<input
									id="api-token-password"
									className="form-control"
									type="password"
									value={password}
									onChange={(event) => setPassword(event.target.value)}
									autoComplete="current-password"
									required
								/>
							</div>
							{options.requires2fa && (
								<div className="mb-3">
									<label className="form-label" htmlFor="api-token-code">
										<T id="api-tokens.two-factor" />
									</label>
									<input
										id="api-token-code"
										className="form-control"
										type="text"
										value={code}
										onChange={(event) => setCode(event.target.value)}
										autoComplete="one-time-code"
										required
									/>
								</div>
							)}
						</fieldset>
					</Modal.Body>
					<Modal.Footer>
						<Button onClick={close} disabled={isSubmitting}>
							<T id="cancel" />
						</Button>
						<Button
							type="submit"
							color="teal"
							isLoading={isSubmitting}
							disabled={
								isSubmitting ||
								!name.trim() ||
								!scopes.length ||
								!password ||
								(options.requires2fa && !code.trim())
							}
						>
							<T id="api-tokens.create" />
						</Button>
					</Modal.Footer>
				</form>
			)}
		</Modal>
	);
}
