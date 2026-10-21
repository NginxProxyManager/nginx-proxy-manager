import cn from "classnames";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import type { OpenIDClientConfiguration, SAMLClientConfiguration, SingleSignOnClientType } from "src/api/backend";
import { Button, Loading } from "src/components";
import { useSetSingleSignOnClient, useSingleSignOnClient } from "src/hooks";
import { T } from "src/locale";
import { validateString } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";

type ModalId = number | "new_openid" | "new_saml";

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

	const isOpenIDConfig = (
		c: SAMLClientConfiguration | OpenIDClientConfiguration | undefined,
	): c is OpenIDClientConfiguration => {
		return "redirectUrl" in (c || {});
	};

	// const isSAMLConfig = (c: SAMLClientConfiguration | OpenIDClientConfiguration | undefined): c is SAMLClientConfiguration => {
	//   return "samlEndpoint" in (c || {});
	// }

	// Generate the redirect URL for new OpenID form
	if (isOpenIDConfig(data?.configuration) && !data.id) {
		const url = `${document.location.protocol}//${document.location.host}/api/sso/oauth2/{id}/callback`;
		data.configuration.redirectUrl = url;
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
				<Formik initialValues={{ ...data } as any} validateOnBlur={true} onSubmit={onSubmit}>
					{() => (
						<Form>
							<Modal.Header closeButton>
								<Modal.Title>
									<T id={data?.id ? "object.edit" : "object.add"} tData={{ object: "sso-client" }} />
								</Modal.Title>
							</Modal.Header>
							<Modal.Body>
								<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible>
									{errorMsg}
								</Alert>
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
											const isSecret = field_name.includes("Secret");
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
																		{form.errors.configuration?.[field_name] &&
																		form.touched.configuration?.[field_name]
																			? form.errors.configuration?.[field_name]
																			: null}
																	</div>
																) : null}
																{!(
																	field_name in (form.errors.configuration || {}) &&
																	form.touched.configuration?.[field_name]
																) &&
																((isNew && !isSecret) || (!isNew && isSecret)) ? (
																	<small className="text-muted">
																		<T id={`sso.config.${trfield}.hint`} />
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
																	"bg-teal": field.checked,
																})}
																onChange={(e) =>
																	form.setFieldValue("enabled", e.target.checked)
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
							</Modal.Body>
							<Modal.Footer>
								<Button data-bs-dismiss="modal" onClick={remove} disabled={isSubmitting}>
									<T id="cancel" />
								</Button>
								<Button
									type="submit"
									className="ms-auto btn-teal"
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
