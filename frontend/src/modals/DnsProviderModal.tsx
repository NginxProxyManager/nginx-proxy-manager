import { useQuery, useQueryClient } from "@tanstack/react-query";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import {
	createDnsProvider,
	type DnsProvider,
	getDnsProvider,
	testDnsProvider,
	updateDnsProvider,
} from "src/api/backend";
import { Button, Loading } from "src/components";
import { intl, T } from "src/locale";
import { validateIPv4, validateString } from "src/modules/Validations";
import { showError, showObjectSuccess, showSuccess } from "src/notifications";

const showDnsProviderModal = (id: number | "new") => {
	EasyModal.show(DnsProviderModal, { id });
};

const CREDENTIAL_FIELDS = ["accountId", "projectName", "username", "password"] as const;

const emptyDnsProvider = (): DnsProvider =>
	({
		ownerUserId: 0,
		name: "",
		type: "selectel",
		credentials: {
			accountId: "",
			projectName: "",
			username: "",
			password: "",
		},
		defaultIp: "",
		ttl: 300,
		meta: {},
	}) as DnsProvider;

interface Props extends InnerModalProps {
	id: number | "new";
}
const DnsProviderModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const queryClient = useQueryClient();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isTesting, setIsTesting] = useState(false);

	const { data, isLoading, error } = useQuery<DnsProvider, Error>({
		queryKey: ["dns-provider", id],
		queryFn: () =>
			id === "new"
				? Promise.resolve({
						...emptyDnsProvider(),
					})
				: getDnsProvider(id),
		staleTime: 60 * 1000,
	});

	// When editing, the API never returns stored credentials (write-only), so
	// the form always starts with blank credential inputs regardless of what's saved.
	const initialValues: DnsProvider = {
		...emptyDnsProvider(),
		...data,
		credentials: {
			accountId: "",
			projectName: "",
			username: "",
			password: "",
		},
	};

	const validate = (values: any) => {
		const errors: any = {};
		const credentials = values.credentials || {};
		const anyCredentialFilled = CREDENTIAL_FIELDS.some((key) => `${credentials[key] || ""}`.trim().length > 0);

		// Credentials are required when creating a new provider. When editing, they're
		// optional (blank = keep existing), but if the user starts typing one field we
		// require all of them so we never send a partial credentials object.
		if (id === "new" || anyCredentialFilled) {
			const credentialErrors: any = {};
			CREDENTIAL_FIELDS.forEach((key) => {
				if (!`${credentials[key] || ""}`.trim().length) {
					credentialErrors[key] = intl.formatMessage({ id: "error.required" });
				}
			});
			if (Object.keys(credentialErrors).length) {
				errors.credentials = credentialErrors;
			}
		}

		return errors;
	};

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		const credentials = values.credentials || {};
		const hasCredentialInput = CREDENTIAL_FIELDS.some((key) => `${credentials[key] || ""}`.trim().length > 0);

		const payload: DnsProvider = {
			id: id === "new" ? undefined : id,
			name: values.name,
			type: values.type,
			defaultIp: values.defaultIp,
			ttl: values.ttl ? Number(values.ttl) : undefined,
		} as DnsProvider;

		// CRITICAL: credentials are write-only and never returned by the API.
		// Only include them in the payload on create (always required), or on edit
		// when the user actually typed new values. Omitting the key on edit with
		// blank fields prevents overwriting the stored credentials.
		if (id === "new" || hasCredentialInput) {
			payload.credentials = credentials;
		}

		try {
			if (payload.id) {
				await updateDnsProvider(payload);
			} else {
				await createDnsProvider(payload);
			}
			queryClient.invalidateQueries({ queryKey: ["dns-providers"] });
			queryClient.invalidateQueries({ queryKey: ["dns-provider", id] });
			showObjectSuccess("dns-provider", "saved");
			remove();
		} catch (err: any) {
			setErrorMsg(<T id={err.message} />);
		}
		setIsSubmitting(false);
		setSubmitting(false);
	};

	const onTestConnection = async () => {
		if (id === "new" || isTesting) return;
		setIsTesting(true);
		try {
			const result = await testDnsProvider(id);
			if (result.ok) {
				showSuccess(intl.formatMessage({ id: "dns-providers.test-connection.success" }));
			} else {
				showError(
					intl.formatMessage({ id: "dns-providers.test-connection.failed" }, { error: result.error || "" }),
				);
			}
		} catch (err: any) {
			showError(err.message);
		}
		setIsTesting(false);
	};

	return (
		<Modal show={visible} onHide={remove}>
			{!isLoading && error && (
				<Alert variant="danger" className="m-3">
					{error?.message || "Unknown error"}
				</Alert>
			)}
			{isLoading && <Loading noLogo />}
			{!isLoading && data !== undefined && (
				<Formik initialValues={initialValues} validate={validate} onSubmit={onSubmit}>
					{() => (
						<Form>
							<Modal.Header closeButton>
								<Modal.Title>
									<T
										id={id === "new" ? "object.add" : "object.edit"}
										tData={{ object: "dns-provider" }}
									/>
								</Modal.Title>
							</Modal.Header>
							<Modal.Body className="p-0">
								<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible>
									{errorMsg}
								</Alert>
								<div className="card m-0 border-0">
									<div className="card-body">
										<Field name="name" validate={validateString(1, 255)}>
											{({ field, form }: any) => (
												<div className="mb-3">
													<label htmlFor="name" className="form-label">
														<T id="column.name" />
													</label>
													<input
														id="name"
														type="text"
														required
														autoComplete="off"
														className="form-control"
														{...field}
													/>
													{form.errors.name && form.touched.name ? (
														<div className="invalid-feedback d-block">
															{form.errors.name}
														</div>
													) : null}
												</div>
											)}
										</Field>
										<Field name="type">
											{({ field }: any) => (
												<div className="mb-3">
													<label htmlFor="type" className="form-label">
														<T id="dns-providers.type" />
													</label>
													<select id="type" className="form-select" {...field}>
														<option value="selectel">
															{intl.formatMessage({ id: "dns-providers.type.selectel" })}
														</option>
													</select>
												</div>
											)}
										</Field>
										<Field name="defaultIp" validate={validateIPv4()}>
											{({ field, form }: any) => (
												<div className="mb-3">
													<label htmlFor="defaultIp" className="form-label">
														<T id="dns-providers.default-ip" />
													</label>
													<input
														id="defaultIp"
														type="text"
														required
														autoComplete="off"
														placeholder="203.0.113.10"
														className="form-control"
														{...field}
													/>
													{form.errors.defaultIp && form.touched.defaultIp ? (
														<div className="invalid-feedback d-block">
															{form.errors.defaultIp}
														</div>
													) : null}
													<small className="form-text text-muted">
														<T id="dns-providers.default-ip.help" />
													</small>
												</div>
											)}
										</Field>
										<Field name="ttl">
											{({ field }: any) => (
												<div className="mb-3">
													<label htmlFor="ttl" className="form-label">
														<T id="dns-providers.ttl" />
													</label>
													<input
														id="ttl"
														type="number"
														min={0}
														autoComplete="off"
														className="form-control"
														{...field}
													/>
												</div>
											)}
										</Field>

										<h3 className="py-2">
											<T id="dns-providers.credentials" />
										</h3>
										<small className="form-text text-muted d-block mb-3">
											<T
												id={
													id === "new"
														? "dns-providers.credentials.help"
														: "dns-providers.credentials.edit-note"
												}
											/>
										</small>

										<Field name="credentials.accountId">
											{({ field, form }: any) => (
												<div className="mb-3">
													<label htmlFor="credentialsAccountId" className="form-label">
														<T id="dns-providers.credentials.account-id" />
													</label>
													<input
														id="credentialsAccountId"
														type="text"
														autoComplete="off"
														className="form-control"
														{...field}
													/>
													{form.errors.credentials?.accountId &&
													form.touched.credentials?.accountId ? (
														<div className="invalid-feedback d-block">
															{form.errors.credentials.accountId}
														</div>
													) : null}
												</div>
											)}
										</Field>
										<Field name="credentials.projectName">
											{({ field, form }: any) => (
												<div className="mb-3">
													<label htmlFor="credentialsProjectName" className="form-label">
														<T id="dns-providers.credentials.project-name" />
													</label>
													<input
														id="credentialsProjectName"
														type="text"
														autoComplete="off"
														className="form-control"
														{...field}
													/>
													{form.errors.credentials?.projectName &&
													form.touched.credentials?.projectName ? (
														<div className="invalid-feedback d-block">
															{form.errors.credentials.projectName}
														</div>
													) : null}
												</div>
											)}
										</Field>
										<Field name="credentials.username">
											{({ field, form }: any) => (
												<div className="mb-3">
													<label htmlFor="credentialsUsername" className="form-label">
														<T id="dns-providers.credentials.username" />
													</label>
													<input
														id="credentialsUsername"
														type="text"
														autoComplete="off"
														className="form-control"
														{...field}
													/>
													{form.errors.credentials?.username &&
													form.touched.credentials?.username ? (
														<div className="invalid-feedback d-block">
															{form.errors.credentials.username}
														</div>
													) : null}
												</div>
											)}
										</Field>
										<Field name="credentials.password">
											{({ field, form }: any) => (
												<div className="mb-3">
													<label htmlFor="credentialsPassword" className="form-label">
														<T id="dns-providers.credentials.password" />
													</label>
													<input
														id="credentialsPassword"
														type="password"
														autoComplete="new-password"
														className="form-control"
														{...field}
													/>
													{form.errors.credentials?.password &&
													form.touched.credentials?.password ? (
														<div className="invalid-feedback d-block">
															{form.errors.credentials.password}
														</div>
													) : null}
												</div>
											)}
										</Field>

										{id !== "new" ? (
											<Button
												size="sm"
												onClick={onTestConnection}
												isLoading={isTesting}
												disabled={isTesting}
											>
												<T id="dns-providers.test-connection" />
											</Button>
										) : null}
									</div>
								</div>
							</Modal.Body>
							<Modal.Footer>
								<Button data-bs-dismiss="modal" onClick={remove} disabled={isSubmitting}>
									<T id="cancel" />
								</Button>
								<Button
									type="submit"
									actionType="primary"
									className="ms-auto bg-teal"
									data-bs-dismiss="modal"
									isLoading={isSubmitting}
									disabled={isSubmitting}
								>
									<T id="save" />
								</Button>
							</Modal.Footer>
						</Form>
					)}
				</Formik>
			)}
		</Modal>
	);
});

export { showDnsProviderModal };
