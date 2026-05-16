import CodeEditor from "@uiw/react-textarea-code-editor";
import cn from "classnames";
import { Field, Form, Formik, useFormikContext } from "formik";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import { Button, Loading, SSLCertificateField } from "src/components";
import { useSetSetting, useSetting } from "src/hooks";
import { intl, T } from "src/locale";
import { validateString } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";

function ForceSSLField() {
	const { values, setFieldValue } = useFormikContext();
	const v: any = values || {};
	const hasCertificate = v?.certificateId && v?.certificateId > 0;
	const sslForced = !!v?.sslForced;

	const toggleClasses = "form-check-input";
	const toggleEnabled = cn(toggleClasses, "bg-teal");

	return (
		<Field name="sslForced">
			{({ field }: any) => (
				<label className="form-check form-switch mt-1">
					<input
						className={sslForced ? toggleEnabled : toggleClasses}
						type="checkbox"
						checked={sslForced}
						onChange={(e) => setFieldValue(field.name, e.target.checked)}
						disabled={!hasCertificate}
					/>
					<span className="form-check-label">
						<T id="domains.force-ssl" />
					</span>
				</label>
			)}
		</Field>
	);
}

export default function DefaultSite() {
	const { data, isLoading, error } = useSetting("default-site");
	const { mutate: setSetting } = useSetSetting();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		const certificateId =
			typeof values.certificateId === "number" && values.certificateId > 0 ? values.certificateId : 0;

		const payload = {
			id: "default-site",
			value: values.value,
			meta: {
				redirect: values.redirect,
				html: values.html,
				certificate_id: certificateId,
				ssl_forced: certificateId > 0 ? !!values.sslForced : false,
			},
		};

		setSetting(payload, {
			onError: (err: any) => setErrorMsg(<T id={err.message} />),
			onSuccess: () => {
				showObjectSuccess("setting", "saved");
			},
			onSettled: () => {
				setIsSubmitting(false);
				setSubmitting(false);
			},
		});
	};

	if (!isLoading && error) {
		return (
			<div className="card-body">
				<div className="mb-3">
					<Alert variant="danger" show>
						{error.message}
					</Alert>
				</div>
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="card-body">
				<div className="mb-3">
					<Loading noLogo />
				</div>
			</div>
		);
	}

	return (
		<Formik
			initialValues={
				{
					value: data?.value || "congratulations",
					redirect: data?.meta?.redirect || "",
					html: data?.meta?.html || "",
					certificateId: data?.meta?.certificate_id || 0,
					sslForced: !!data?.meta?.ssl_forced,
				} as any
			}
			onSubmit={onSubmit}
		>
			{({ values }) => (
				<Form>
					<div className="card-body">
						<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible>
							{errorMsg}
						</Alert>
						<Field name="value">
							{({ field, form }: any) => (
								<div className="mb-3">
									<label className="form-label" htmlFor="setting-host-unknown">
										<T id="settings.default-site.description" />
									</label>
									<div className="form-selectgroup form-selectgroup-boxes d-flex flex-column">
										<label className="form-selectgroup-item flex-fill">
											<input
												type="radio"
												name={field.name}
												value="congratulations"
												className="form-selectgroup-input"
												checked={field.value === "congratulations"}
												onChange={(e) => form.setFieldValue(field.name, e.target.value)}
											/>
											<div className="form-selectgroup-label d-flex align-items-center p-3">
												<div className="me-3">
													<span className="form-selectgroup-check" />
												</div>
												<div>
													<T id="settings.default-site.congratulations" />
												</div>
											</div>
										</label>
										<label className="form-selectgroup-item flex-fill">
											<input
												type="radio"
												name={field.name}
												value="404"
												className="form-selectgroup-input"
												checked={field.value === "404"}
												onChange={(e) => form.setFieldValue(field.name, e.target.value)}
											/>
											<div className="form-selectgroup-label d-flex align-items-center p-3">
												<div className="me-3">
													<span className="form-selectgroup-check" />
												</div>
												<div>
													<T id="settings.default-site.404" />
												</div>
											</div>
										</label>
										<label className="form-selectgroup-item flex-fill">
											<input
												type="radio"
												name={field.name}
												value="444"
												className="form-selectgroup-input"
												checked={field.value === "444"}
												onChange={(e) => form.setFieldValue(field.name, e.target.value)}
											/>
											<div className="form-selectgroup-label d-flex align-items-center p-3">
												<div className="me-3">
													<span className="form-selectgroup-check" />
												</div>
												<div>
													<T id="settings.default-site.444" />
												</div>
											</div>
										</label>
										<label className="form-selectgroup-item flex-fill">
											<input
												type="radio"
												name={field.name}
												value="redirect"
												className="form-selectgroup-input"
												checked={field.value === "redirect"}
												onChange={(e) => form.setFieldValue(field.name, e.target.value)}
											/>
											<div className="form-selectgroup-label d-flex align-items-center p-3">
												<div className="me-3">
													<span className="form-selectgroup-check" />
												</div>
												<div>
													<T id="settings.default-site.redirect" />
												</div>
											</div>
										</label>
										<label className="form-selectgroup-item flex-fill">
											<input
												type="radio"
												name={field.name}
												value="html"
												className="form-selectgroup-input"
												checked={field.value === "html"}
												onChange={(e) => form.setFieldValue(field.name, e.target.value)}
											/>
											<div className="form-selectgroup-label d-flex align-items-center p-3">
												<div className="me-3">
													<span className="form-selectgroup-check" />
												</div>
												<div>
													<T id="settings.default-site.html" />
												</div>
											</div>
										</label>
									</div>
								</div>
							)}
						</Field>
						{values.value === "redirect" && (
							<Field name="redirect" validate={validateString(1, 255)}>
								{({ field, form }: any) => (
									<div className="mt-5 mb-3">
										<label className="form-label" htmlFor="setting-host-unknown">
											<T id="settings.default-site.redirect" />
										</label>
										<div>
											<input
												id="redirect"
												type="text"
												placeholder="https://"
												required
												autoComplete="off"
												className="form-control"
												{...field}
											/>
											{form.errors.redirect ? (
												<div className="invalid-feedback">
													{form.errors.redirect && form.touched.redirect
														? form.errors.redirect
														: null}
												</div>
											) : null}
										</div>
									</div>
								)}
							</Field>
						)}
						{values.value === "html" && (
							<Field name="html" validate={validateString(1)}>
								{({ field, form }: any) => (
									<div className="mt-5 mb-3">
										<label className="form-label" htmlFor="setting-host-unknown">
											<T id="settings.default-site.html" />
										</label>
										<div>
											<CodeEditor
												// Believe it or not, 'html' sucks yet 'php' renders the html
												// content much nicer.
												language="php"
												placeholder={intl.formatMessage({
													id: "settings.default-site.html.placeholder",
												})}
												padding={15}
												data-color-mode="dark"
												minHeight={300}
												indentWidth={2}
												style={{
													fontFamily:
														"ui-monospace,SFMono-Regular,SF Mono,Consolas,Liberation Mono,Menlo,monospace",
													borderRadius: "0.3rem",
													minHeight: "300px",
													backgroundColor: "var(--tblr-bg-surface-dark)",
												}}
												{...field}
											/>
											{form.errors.html ? (
												<div className="invalid-feedback">
													{form.errors.html && form.touched.html ? form.errors.html : null}
												</div>
											) : null}
										</div>
									</div>
								)}
							</Field>
						)}
						{values.value !== "congratulations" && (
							<div className="mt-5">
								<SSLCertificateField
									name="certificateId"
									label="ssl-certificate"
									forHttp={true}
								/>
								<ForceSSLField />
							</div>
						)}
					</div>
					<div className="card-footer bg-transparent mt-auto">
						<div className="btn-list justify-content-end">
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
						</div>
					</div>
				</Form>
			)}
		</Formik>
	);
}
