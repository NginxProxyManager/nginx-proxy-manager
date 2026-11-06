import { IconAlertTriangle } from "@tabler/icons-react";
import cn from "classnames";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import type {
	SAMLClientConfiguration,
	SingleSignOnClient,
	SingleSignOnClientConfigurationType,
	SingleSignOnClientType,
} from "src/api/backend";
import { Button, Loading } from "src/components";
import { SingleSignOnButton } from "src/components/Form/SingleSignOnButton";
import { AllowInternalUserFields } from "src/components/Form/SSOInternalUsersFields";
import { ProvisionUserFields } from "src/components/Form/SSOProvisionUserFields";
import { useSetSingleSignOnClient, useSingleSignOnClient } from "src/hooks";
import { T } from "src/locale";
import { validateString } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";

type ModalId = number | "new_openid" | "new_github" | "new_saml" | "new_auth0";

let clientType: SingleSignOnClientType | undefined;

const showSingleSignOnClientModal = (id: ModalId, type: SingleSignOnClientType) => {
	clientType = type;
	EasyModal.show(SingleSignOnClientModal, { id });
};

interface Props extends InnerModalProps {
	id: ModalId;
}

const SingleSignOnClientModal = EasyModal.create((prop: Props) => {
	const { id, visible, remove } = prop;
	const { data, isLoading, error } = useSingleSignOnClient(id, { clientType });
	const { mutate: setSingleSignOnClient } = useSetSingleSignOnClient();
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		values.meta = { roleMap: [...(values.provisionRoleMap || [])] };
		delete values.provisionRoleMap;

		const { ...payload } = {
			id: id.toString().includes("new") ? undefined : id,
			...values,
		};

		setSingleSignOnClient(payload, {
			onError: (err: any) => setErrorMsg(err.message),
			onSuccess: () => {
				showObjectSuccess("sso-client", "saved");
				remove();
			},
			onSettled: () => {
				setIsSubmitting(false);
				setSubmitting(false);
			},
		});
	};

	const isSAMLConfig = (c: SingleSignOnClientConfigurationType | undefined): c is SAMLClientConfiguration => {
		return "samlEndpoint" in (c || {});
	};

	// Generate the redirect URL for new OpenID form
	if (data && !data.id && data.configuration && "redirectUrl" in data.configuration) {
		const type = data.clientType.toLocaleLowerCase();
		const url = `${document.location.protocol}//${document.location.host}/api/sso/oauth2/${type}/{id}/callback`;
		data.configuration.redirectUrl = url;
	}

	if (data && !data.id) {
		data.name = data.clientType;
	}

	if (data && (!data?.provisionRoleMap || !Object.keys(data.provisionRoleMap).length)) {
		data.provisionRoleMap = [{ role: "user", group: "" }];
	}

	return (
		<Modal show={visible} onHide={remove}>
			{!isLoading && error && (
				<Alert variant="danger" className="m-3">
					{error?.message || "Unknown error"}
				</Alert>
			)}
			{isLoading && <Loading noLogo />}
			{!isLoading && data && (
				<Formik
					initialValues={{ ...data } as SingleSignOnClient}
					validateOnBlur={true}
					onSubmit={(v, s) => {
						v.provisionRoleMap = v.provisionRoleMap?.filter(
							(map) => !!map.group && map.group.trim().length > 0,
						);
						onSubmit(v, s);
					}}
				>
					{(form) => (
						<Form>
							<Modal.Header closeButton>
								<Modal.Title>
									<T id={data?.id ? "object.edit" : "object.add"} tData={{ object: "sso-client" }} />
								</Modal.Title>
							</Modal.Header>
							<Modal.Body className="p-0 w-100">
								<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible>
									{errorMsg}
								</Alert>
								<div className="card border-0">
									<div className="card-header">
										<ul
											id="sso-nav"
											className="nav nav-tabs card-header-tabs"
											data-bs-toggle="tabs"
										>
											<li className="nav-item" role="presentation">
												<a
													href="#tab-idp"
													className="nav-link active"
													data-bs-toggle="tab"
													aria-selected="true"
													role="tab"
												>
													<T id="sso.config.tabs.idp" />
												</a>
											</li>
											<li className="nav-item" role="presentation">
												<a
													href="#tab-access"
													className="nav-link"
													data-bs-toggle="tab"
													aria-selected="false"
													tabIndex={-1}
													role="tab"
												>
													<T id="sso.config.tabs.users" />
												</a>
											</li>
											<li className="nav-item" role="presentation">
												<a
													href="#tab-provisioning"
													className="nav-link"
													data-bs-toggle="tab"
													aria-selected="false"
													tabIndex={-1}
													role="tab"
												>
													<T id="sso.config.tabs.provisioning" />
												</a>
											</li>
											<li className="nav-item" role="presentation">
												<a
													href="#tab-settings"
													className="nav-link"
													data-bs-toggle="tab"
													aria-selected="false"
													tabIndex={-1}
													role="tab"
												>
													<T id="sso.config.tabs.settings" />
												</a>
											</li>
										</ul>
									</div>
								</div>
								<div className="card-body p-4 pt-2">
									<div className="tab-content">
										<div className="tab-pane active show pt-2" id="tab-idp" role="tabpanel">
											<div className="row">
												<div className="col-lg-6">
													<div className="mb-3">
														<Field name="name" validate={validateString(1, 50)}>
															{({ field, form }: any) => (
																<div className="form-floating mb-3">
																	<input
																		id="name"
																		className={`form-control ${form.errors.name && form.touched.name ? "is-invalid" : ""}`}
																		placeholder=""
																		{...field}
																	/>
																	<label htmlFor="name">
																		<T id="sso.config.name.label" />
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
														<Field name="clientType">
															{({ field }: any) => (
																<div className="form-floating mb-3">
																	<input
																		id="clientType"
																		className={"form-control"}
																		readOnly
																		{...field}
																	/>
																	<label htmlFor="client-type">
																		<T id="sso.config.protocol.label" />
																	</label>
																</div>
															)}
														</Field>
													</div>
												</div>
											</div>
											<div className="mb-3">
												{(data.configuration &&
													Object.keys(data.configuration).map((field_name) => {
														const trfield = field_name.replace(
															/[A-Z]/g,
															(letter) => `_${letter.toLowerCase()}`,
														);
														const isNew = !data?.id;
														const isSecret = field_name
															.toLocaleLowerCase()
															.includes("secret");
														const type = isSecret ? "password" : "text";
														const minLength = isSecret && !isNew ? 0 : 1;
														return (
															<div key={`configuration[${field_name}]`} className="mb-3">
																<Field
																	name={`configuration[${field_name}]`}
																	validate={validateString(minLength, 255)}
																>
																	{({ field, form }: any) => (
																		<div className="form-floating mb-3">
																			<input
																				{...field}
																				id={`configuration[${field_name}]`}
																				type={type}
																				className={`form-control ${form.errors.configuration?.[field_name] && form.touched.configuration?.[field_name] ? "is-invalid" : ""}`}
																				placeholder={""}
																			/>
																			<label htmlFor={field_name}>
																				<T id={`sso.config.${trfield}.label`} />
																			</label>
																			{form.errors.configuration?.[field_name] ? (
																				<div className="invalid-feedback">
																					{form.errors.configuration?.[
																						field_name
																					] &&
																					form.touched.configuration?.[
																						field_name
																					]
																						? form.errors.configuration?.[
																								field_name
																							]
																						: null}
																				</div>
																			) : null}
																			{!(
																				field_name in
																					(form.errors.configuration || {}) &&
																				form.touched.configuration?.[field_name]
																			) &&
																			((isNew && !isSecret) ||
																				(!isNew && isSecret)) ? (
																				<small className="text-muted">
																					<T
																						id={`sso.config.${trfield}.hint`}
																					/>
																				</small>
																			) : null}
																		</div>
																	)}
																</Field>
															</div>
														);
													})) ||
													null}
											</div>
											{isSAMLConfig(data.configuration) && (
												<div className="alert alert-warning">
													<IconAlertTriangle size="20" />
													<T
														id="sso.config.protocol-disabled"
														data={{ protocol: data.clientType }}
													/>
												</div>
											)}
											<div className="mb-3 m-2">
												<div>
													<label className="row" htmlFor="enabled">
														<span className="col">
															<T id="enabled" />
														</span>
														<span className="col-auto">
															<Field name="enabled" type="checkbox">
																{({ field, form }: any) => (
																	<label className="form-check form-check-single form-switch">
																		<input
																			id="enabled"
																			checked={field.value === true}
																			className={cn("form-check-input", {
																				"bg-indigo": field.checked,
																			})}
																			onChange={(e) =>
																				form.setFieldValue(
																					"enabled",
																					e.target.checked,
																				)
																			}
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
										<div className="tab-pane pt-2" id="tab-access" role="tabpanel">
											<AllowInternalUserFields
												{...{
													allowInternal: form.values.allowInternal,
													requireGroup: form.values.requireGroup,
												}}
											/>
										</div>
										<div className="tab-pane pt-2" id="tab-provisioning" role="tabpanel">
											<ProvisionUserFields
												{...{
													provisionRoleMap: form.values.provisionRoleMap,
													provisionUsers: form.values.provisionUsers,
													requireProvisionGroup: form.values.requireProvisionGroup,
													requireProvisionGroupName: form.values.requireProvisionGroupName,
												}}
											/>
										</div>
										<div className="tab-pane pt-2" id="tab-settings" role="tabpanel">
											<div>
												<div>
													<label className="row mt-1" htmlFor="requireVerifiedEmail">
														<h4 className="col mb-1">
															<T id="sso.config.settings.require-verified-email.label" />
														</h4>
														<span className="col-auto">
															<Field name="requireVerifiedEmail" type="checkbox">
																{({ field, form }: any) => (
																	<label className="form-check form-check-single form-switch">
																		<input
																			id="requireVerifiedEmail"
																			checked={field.value === true}
																			className={cn("form-check-input", {
																				"bg-indigo": field.checked,
																			})}
																			onChange={(e) =>
																				form.setFieldValue(
																					"requireVerifiedEmail",
																					e.target.checked,
																				)
																			}
																			type="checkbox"
																		/>
																	</label>
																)}
															</Field>
														</span>
													</label>
													<small className="text-muted">
														<T id={"sso.config.settings.require-verified-email.hint"} />
													</small>
												</div>
											</div>
											<div className="col-lg-6 mt-4">
												<label htmlFor="buttonText">
													<h4>
														<T id="sso.config.settings.button-text.label" />
													</h4>
												</label>
												<div>
													<Field name="buttonText" validate={validateString(0, 48)}>
														{({ field, form }: any) => (
															<div>
																<input
																	id="buttonText"
																	className={`form-control ${form.errors.buttonText && form.touched.buttonText ? "is-invalid" : ""}`}
																	placeholder=""
																	{...field}
																	onChange={(e) => {
																		form.setFieldValue(
																			"buttonText",
																			e.target.value,
																		);
																		//setButtonText(e.target.value);
																	}}
																/>
																{form.errors.buttonText ? (
																	<div className="invalid-feedback mb-0">
																		{form.errors.buttonText &&
																		form.touched.buttonText
																			? form.errors.buttonText
																			: null}
																	</div>
																) : null}
															</div>
														)}
													</Field>
												</div>
											</div>
											<small className="text-muted">
												<T id={"sso.config.settings.button-text.hint"} />
											</small>
											<div className="row mt-3">
												<label className="row" htmlFor="requireGroup">
													<h4>
														<T id="sso.config.settings.button-preview.label" />
													</h4>
												</label>
												<div className="border-0 py-3 w-75">
													<SingleSignOnButton
														{...{
															config: {
																id: 0,
																name: form.values.name,
																type: form.values.clientType,
																label: form.values.buttonText,
															},
														}}
													/>
												</div>
											</div>
										</div>
									</div>
								</div>
							</Modal.Body>
							<Modal.Footer>
								<Button data-bs-dismiss="modal" onClick={remove} disabled={isSubmitting}>
									<T id="cancel" />
								</Button>
								<Button
									type="submit"
									className="ms-auto btn-indigo"
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

export { showSingleSignOnClientModal };
