import { Field, Form, Formik } from "formik";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import { Button, Loading } from "src/components";
import { useSetSetting, useSetting } from "src/hooks";
import { intl, T } from "src/locale";
import { showObjectSuccess } from "src/notifications";

const HEADER_OPTIONS = [
	{ value: "X-Real-IP", localeId: "settings.real-ip-header.x-real-ip", descId: "settings.real-ip-header.x-real-ip.description" },
	{ value: "CF-Connecting-IP", localeId: "settings.real-ip-header.cf-connecting-ip", descId: "settings.real-ip-header.cf-connecting-ip.description" },
	{ value: "X-Forwarded-For", localeId: "settings.real-ip-header.x-forwarded-for", descId: "settings.real-ip-header.x-forwarded-for.description" },
	{ value: "custom", localeId: "settings.real-ip-header.custom", descId: null },
];

export default function RealIpHeader() {
	const { data, isLoading, error } = useSetting("real-ip-header");
	const { mutate: setSetting } = useSetSetting();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		const payload = {
			id: "real-ip-header",
			value: values.value,
			meta: {
				custom: values.custom,
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
					value: data?.value || "X-Real-IP",
					custom: data?.meta?.custom || "",
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
									<label className="form-label" htmlFor="real-ip-header-value">
										<T id="settings.real-ip-header.description" />
									</label>
									<div className="form-selectgroup form-selectgroup-boxes d-flex flex-column" id="real-ip-header-value">
										{HEADER_OPTIONS.map((opt) => (
											<label key={opt.value} className="form-selectgroup-item flex-fill">
												<input
													type="radio"
													name={field.name}
													value={opt.value}
													className="form-selectgroup-input"
													checked={field.value === opt.value}
													onChange={(e) => form.setFieldValue(field.name, e.target.value)}
												/>
												<div className="form-selectgroup-label d-flex align-items-center p-3">
													<div className="me-3">
														<span className="form-selectgroup-check" />
													</div>
													<div>
														<strong><T id={opt.localeId} /></strong>
														{opt.descId && (
															<div className="text-secondary">
																<T id={opt.descId} />
															</div>
														)}
													</div>
												</div>
											</label>
										))}
									</div>
								</div>
							)}
						</Field>
						{values.value === "custom" && (
							<Field name="custom">
								{({ field }: any) => (
									<div className="mt-3 mb-3">
										<label className="form-label" htmlFor="real-ip-header-custom">
											<T id="settings.real-ip-header.custom" />
										</label>
										<div>
											<input
												id="real-ip-header-custom"
												type="text"
												placeholder={intl.formatMessage({
													id: "settings.real-ip-header.custom.placeholder",
												})}
												required
												autoComplete="off"
												className="form-control"
												{...field}
											/>
										</div>
									</div>
								)}
							</Field>
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
