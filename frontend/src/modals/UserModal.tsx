import { IconLink, IconLinkOff } from "@tabler/icons-react";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { useState } from "react";
import { Alert, Badge, Spinner } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { authorizeLinkOidc } from "src/api/backend";
import { Button, Loading } from "src/components";
import { useOidcIdentities, useOidcProviders, useSetUser, useUnlinkOidcIdentity, useUser } from "src/hooks";
import { intl, T } from "src/locale";
import { validateEmail, validateString } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";

const showUserModal = (id: number | "me" | "new") => {
	EasyModal.show(UserModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "me" | "new";
}
const UserModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const { data, isLoading, error } = useUser(id);
	const { data: currentUser, isLoading: currentIsLoading } = useUser("me");
	const { mutate: setUser } = useSetUser();
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Linked accounts state
	const { data: oidcProviders } = useOidcProviders();
	const hasOidcProviders = oidcProviders && oidcProviders.length > 0;
	const isSelf = id === "me" || (data?.id && data.id === currentUser?.id);
	const showLinkedTab = isSelf && hasOidcProviders;

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		const { ...payload } = {
			id: id === "new" ? undefined : id,
			roles: [],
			...values,
		};

		if (data?.id === currentUser?.id) {
			// Prevent user from locking themselves out
			delete payload.isDisabled;
			delete payload.roles;
		} else if (payload.isAdmin) {
			payload.roles = ["admin"];
		}

		// this isn't a real field, just for the form
		delete payload.isAdmin;

		setUser(payload, {
			onError: (err: any) => setErrorMsg(err.message),
			onSuccess: () => {
				showObjectSuccess("user", "saved");
				remove();
			},
			onSettled: () => {
				setIsSubmitting(false);
				setSubmitting(false);
			},
		});
	};

	return (
		<Modal show={visible} onHide={remove} size={showLinkedTab ? "lg" : undefined}>
			{!isLoading && error && (
				<Alert variant="danger" className="m-3">
					{error?.message || "Unknown error"}
				</Alert>
			)}
			{(isLoading || currentIsLoading) && <Loading noLogo />}
			{!isLoading && !currentIsLoading && data && currentUser && (
				<Formik
					initialValues={
						{
							name: data?.name,
							nickname: data?.nickname,
							email: data?.email,
							isAdmin: data?.roles?.includes("admin"),
							isDisabled: data?.isDisabled,
						} as any
					}
					onSubmit={onSubmit}
				>
					{() => (
						<Form>
							<Modal.Header closeButton>
								<Modal.Title>
									<T id={data?.id ? "object.edit" : "object.add"} tData={{ object: "user" }} />
								</Modal.Title>
							</Modal.Header>
							<Modal.Body className={showLinkedTab ? "p-0" : undefined}>
								<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible className={showLinkedTab ? "m-3 mb-0" : undefined}>
									{errorMsg}
								</Alert>
								{showLinkedTab ? (
									<div className="card m-0 border-0">
										<div className="card-header">
											<ul className="nav nav-tabs card-header-tabs" data-bs-toggle="tabs">
												<li className="nav-item" role="presentation">
													<a
														href="#tab-profile"
														className="nav-link active"
														data-bs-toggle="tab"
														aria-selected="true"
														role="tab"
													>
														<T id="user.profile" />
													</a>
												</li>
												<li className="nav-item" role="presentation">
													<a
														href="#tab-linked-accounts"
														className="nav-link"
														data-bs-toggle="tab"
														aria-selected="false"
														tabIndex={-1}
														role="tab"
													>
														<T id="user.linked-accounts" />
													</a>
												</li>
											</ul>
										</div>
										<div className="card-body">
											<div className="tab-content">
												<div className="tab-pane active show" id="tab-profile" role="tabpanel">
													<ProfileFields currentUser={currentUser} data={data} />
												</div>
												<div className="tab-pane" id="tab-linked-accounts" role="tabpanel">
													<LinkedAccountsTab />
												</div>
											</div>
										</div>
									</div>
								) : (
									<ProfileFields currentUser={currentUser} data={data} />
								)}
							</Modal.Body>
							<Modal.Footer>
								<Button data-bs-dismiss="modal" onClick={remove} disabled={isSubmitting}>
									<T id="cancel" />
								</Button>
								<Button
									type="submit"
									className="ms-auto btn-orange"
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

/**
 * Profile form fields — extracted so the same JSX can be rendered
 * both in the tabbed and non-tabbed layouts.
 */
function ProfileFields({ currentUser, data }: { currentUser: any; data: any }) {
	return (
		<>
			<div className="row">
				<div className="col-lg-6">
					<div className="mb-3">
						<Field name="name" validate={validateString(1, 50)}>
							{({ field, form }: any) => (
								<div className="form-floating mb-3">
									<input
										id="name"
										className={`form-control ${form.errors.name && form.touched.name ? "is-invalid" : ""}`}
										placeholder={intl.formatMessage({ id: "user.full-name" })}
										{...field}
									/>
									<label htmlFor="name">
										<T id="user.full-name" />
									</label>
									{form.errors.name ? (
										<div className="invalid-feedback">
											{form.errors.name && form.touched.name
												? form.errors.name
												: null}
										</div>
									) : null}
								</div>
							)}
						</Field>
					</div>
				</div>
				<div className="col-lg-6">
					<div className="mb-3">
						<Field name="nickname" validate={validateString(1, 30)}>
							{({ field, form }: any) => (
								<div className="form-floating mb-3">
									<input
										id="nickname"
										className={`form-control ${form.errors.nickname && form.touched.nickname ? "is-invalid" : ""}`}
										placeholder={intl.formatMessage({ id: "user.nickname" })}
										{...field}
									/>
									<label htmlFor="nickname">
										<T id="user.nickname" />
									</label>
									{form.errors.nickname ? (
										<div className="invalid-feedback">
											{form.errors.nickname && form.touched.nickname
												? form.errors.nickname
												: null}
										</div>
									) : null}
								</div>
							)}
						</Field>
					</div>
				</div>
			</div>
			<div className="mb-3">
				<Field name="email" validate={validateEmail()}>
					{({ field, form }: any) => (
						<div className="form-floating mb-3">
							<input
								id="email"
								type="email"
								className={`form-control ${form.errors.email && form.touched.email ? "is-invalid" : ""}`}
								placeholder={intl.formatMessage({ id: "email-address" })}
								{...field}
							/>
							<label htmlFor="email">
								<T id="email-address" />
							</label>
							{form.errors.email ? (
								<div className="invalid-feedback">
									{form.errors.email && form.touched.email
										? form.errors.email
										: null}
								</div>
							) : null}
						</div>
					)}
				</Field>
			</div>
			{currentUser && data && currentUser?.id !== data?.id ? (
				<div className="my-3">
					<h4 className="py-2">
						<T id="options" />
					</h4>
					<div className="divide-y">
						<div>
							<label className="row" htmlFor="isAdmin">
								<span className="col">
									<T id="role.admin" />
								</span>
								<span className="col-auto">
									<Field name="isAdmin" type="checkbox">
										{({ field }: any) => (
											<label className="form-check form-check-single form-switch">
												<input
													{...field}
													id="isAdmin"
													className="form-check-input"
													type="checkbox"
												/>
											</label>
										)}
									</Field>
								</span>
							</label>
						</div>
						<div>
							<label className="row" htmlFor="isDisabled">
								<span className="col">
									<T id="disabled" />
								</span>
								<span className="col-auto">
									<Field name="isDisabled" type="checkbox">
										{({ field }: any) => (
											<label className="form-check form-check-single form-switch">
												<input
													{...field}
													id="isDisabled"
													className="form-check-input"
													type="checkbox"
												/>
											</label>
										)}
									</Field>
								</span>
							</label>
						</div>
					</div>
				</div>
			) : null}
		</>
	);
}

/**
 * Linked Accounts tab content — manages its own state for
 * link/unlink operations independently of the profile form.
 */
function LinkedAccountsTab() {
	const { data: currentUser } = useUser("me");
	const { data: identities, isLoading: identitiesLoading } = useOidcIdentities();
	const { data: providers } = useOidcProviders();
	const { mutateAsync: unlinkIdentity } = useUnlinkOidcIdentity();

	const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
	const [linkingId, setLinkingId] = useState<string | null>(null);
	const [linkErrorMsg, setLinkErrorMsg] = useState<string | null>(null);
	const [confirmUnlink, setConfirmUnlink] = useState<string | null>(null);

	const hasPasswordAuth = currentUser?.hasPasswordAuth !== false;
	const linkedProviderIds = new Set((identities || []).map((i) => i.providerId));

	// Providers available to link (enabled, not yet linked)
	const availableProviders = (providers || []).filter((p) => !linkedProviderIds.has(p.id));

	const handleUnlink = async (providerId: string) => {
		setUnlinkingId(providerId);
		setLinkErrorMsg(null);
		try {
			await unlinkIdentity(providerId);
		} catch (err: any) {
			setLinkErrorMsg(err.message || intl.formatMessage({ id: "error.general" }));
		}
		setUnlinkingId(null);
		setConfirmUnlink(null);
	};

	const handleLink = async (providerId: string) => {
		setLinkingId(providerId);
		setLinkErrorMsg(null);
		try {
			const { authorizeUrl, codeVerifier, nonce, state, callbackUrl } = await authorizeLinkOidc(providerId);

			// Store PKCE params so usePendingOidcLink can complete the flow after redirect
			sessionStorage.setItem(
				"oidc_link_pending",
				JSON.stringify({ providerId, codeVerifier, nonce, state, callbackUrl }),
			);

			// Full-page redirect to IdP (matches the login flow pattern)
			window.location.href = authorizeUrl;
		} catch (err: any) {
			setLinkErrorMsg(err.message || intl.formatMessage({ id: "error.general" }));
			setLinkingId(null);
		}
	};

	return (
		<>
			{linkErrorMsg && (
				<Alert variant="danger" dismissible onClose={() => setLinkErrorMsg(null)}>
					{linkErrorMsg}
				</Alert>
			)}

			{identitiesLoading ? (
				<div className="text-center py-3">
					<Spinner animation="border" size="sm" />
				</div>
			) : identities && identities.length > 0 ? (
				<div className="mb-3">
					{identities.map((identity) => {
						const isConfirming = confirmUnlink === identity.providerId;
						const isUnlinking = unlinkingId === identity.providerId;
						const isOnly = !hasPasswordAuth && identities.length <= 1;

						return (
							<div
								key={identity.providerId}
								className="d-flex align-items-center justify-content-between py-2 border-bottom"
							>
								<div>
									<div className="fw-bold">{identity.providerName}</div>
									<div className="text-muted small">
										<T
											id="user.linked-accounts.linked-on"
											data={{ date: new Date(identity.linkedOn).toLocaleDateString() }}
										/>
									</div>
								</div>
								<div className="d-flex align-items-center gap-2">
									{isOnly ? (
										<Badge bg="warning" text="dark">
											<T id="user.linked-accounts.unlink.last-method" />
										</Badge>
									) : isConfirming ? (
										<>
											<span className="text-muted small">
												<T
													id="user.linked-accounts.unlink.confirm"
													data={{ provider: identity.providerName }}
												/>
											</span>
											<Button
												actionType="danger"
												size="sm"
												isLoading={isUnlinking}
												onClick={() => handleUnlink(identity.providerId)}
											>
												<T id="user.linked-accounts.unlink" />
											</Button>
											<Button
												actionType="secondary"
												size="sm"
												onClick={() => setConfirmUnlink(null)}
											>
												<T id="cancel" />
											</Button>
										</>
									) : (
										<Button
											actionType="danger"
											variant="outline"
											size="sm"
											onClick={() => setConfirmUnlink(identity.providerId)}
										>
											<IconLinkOff width={14} />
											<T id="user.linked-accounts.unlink" />
										</Button>
									)}
								</div>
							</div>
						);
					})}
				</div>
			) : (
				<p className="text-muted">
					<T id="user.linked-accounts.empty" />
				</p>
			)}

			{availableProviders.length > 0 && (
				<div className="mt-3">
					<h6>
						<T id="user.linked-accounts.available-providers" />
					</h6>
					{availableProviders.map((provider) => (
						<div key={provider.id} className="d-flex align-items-center justify-content-between py-2">
							<span>{provider.name}</span>
							<Button
								actionType="primary"
								variant="outline"
								size="sm"
								isLoading={linkingId === provider.id}
								disabled={!!linkingId}
								onClick={() => handleLink(provider.id)}
							>
								<IconLink width={14} />
								<T id="user.linked-accounts.link" />
							</Button>
						</div>
					))}
				</div>
			)}
		</>
	);
}

export { showUserModal };
