import { IconSettings } from "@tabler/icons-react";
import cn from "classnames";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form } from "formik";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import type { HostMeta } from "src/api/backend";
import {
	Button,
	DomainNamesField,
	HostConfigTestResult,
	Loading,
	NginxConfigField,
	NginxErrorMessage,
	SaveWarning,
	SSLCertificateField,
	SSLOptionsFields,
	TestConfigButton,
} from "src/components";
import { FormModal } from "src/components/Form";
import { useHostConfigTest, useRedirectionHost, useSetRedirectionHost, useUser } from "src/hooks";
import { T } from "src/locale";
import { validateString } from "src/modules/Validations";
import { formatApiError, getNginxErrorDetails, hasSaveWarnings, stripServerMeta } from "src/modules/HostStatus";
import { showObjectSuccess } from "src/notifications";

const showRedirectionHostModal = (id: number | "new") => {
	EasyModal.show(RedirectionHostModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "new";
}
const RedirectionHostModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const { data: currentUser, isLoading: userIsLoading, error: userError } = useUser("me");
	const { data, isLoading, error } = useRedirectionHost(id);
	const { mutate: setRedirectionHost } = useSetRedirectionHost();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	// Set when a save went through but nginx couldn't load the host
	const [savedMeta, setSavedMeta] = useState<HostMeta | null>(null);
	// Id of a host created by this modal, so that saving again updates it
	const [savedId, setSavedId] = useState<number | null>(null);
	const configTest = useHostConfigTest("redirection-hosts");

	const isAdmin = currentUser?.roles?.includes("admin");

	// What a save sends, also what "Test" checks
	const buildPayload = (values: any) => {
		const payload = {
			id: savedId ?? (id === "new" ? undefined : id),
			...values,
			// server-owned status keys are never sent back
			meta: stripServerMeta(values.meta),
		};
		// Only admins may change the advanced config
		if (!isAdmin) {
			delete payload.advanced_config;
			delete payload.advancedConfig;
		}
		return payload;
	};

	const onSubmit = async (values: any, { setSubmitting, resetForm }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);
		setSavedMeta(null);
		configTest.reset();

		const payload = buildPayload(values);

		setRedirectionHost(payload, {
			onError: (err: unknown) => {
				const details = getNginxErrorDetails(err);
				setErrorMsg(
					details ? (
						<NginxErrorMessage message={formatApiError(err)} details={details} />
					) : (
						formatApiError(err)
					),
				);
			},
			onSuccess: (result: any) => {
				if (result && hasSaveWarnings(result.meta)) {
					// Keep the modal open so the problem can be seen
					setSavedId(result.id || null);
					// A requested certificate ("new") now exists: saving again must not request another one.
					// The saved values become the new baseline, so closing now doesn't ask about unsaved changes.
					resetForm({ values: { ...values, certificateId: result.certificateId || 0 } });
					setSavedMeta(result.meta);
					return;
				}
				showObjectSuccess("redirection-host", "saved");
				remove();
			},
			onSettled: () => {
				setIsSubmitting(false);
				setSubmitting(false);
			},
		});
	};

	return (
		<>
			{(isLoading || userIsLoading || ((error || userError) && (!data || !currentUser))) && (
				<Modal show={visible} onHide={remove}>
					{!isLoading && (error || userError) && (
						<Alert variant="danger" className="m-3">
							{error?.message || userError?.message || "Unknown error"}
						</Alert>
					)}
					{(isLoading || userIsLoading) && <Loading noLogo />}
				</Modal>
			)}
			{!isLoading && !userIsLoading && data && currentUser && (
				<FormModal
					show={visible}
					onHide={remove}
					preventHide={isSubmitting}
					initialValues={
						{
							// Details tab
							domainNames: data?.domainNames || [],
							forwardDomainName: data?.forwardDomainName || "",
							forwardScheme: data?.forwardScheme || "auto",
							forwardHttpCode: data?.forwardHttpCode || 301,
							preservePath: data?.preservePath || false,
							blockExploits: data?.blockExploits || false,
							// SSL tab
							certificateId: data?.certificateId || 0,
							sslForced: data?.sslForced || false,
							http2Support: data?.http2Support || false,
							hstsEnabled: data?.hstsEnabled || false,
							hstsSubdomains: data?.hstsSubdomains || false,
							// Advanced tab
							advancedConfig: data?.advancedConfig || "",
							meta: data?.meta || {},
						} as any
					}
					onSubmit={onSubmit}
				>
					{({ onHide, ...form }) => (
						<Form>
							<Modal.Header closeButton>
								<Modal.Title>
									<T
										id={data?.id || savedId ? "object.edit" : "object.add"}
										tData={{ object: "redirection-host" }}
									/>
								</Modal.Title>
							</Modal.Header>
							<Modal.Body className="p-0">
								{savedMeta ? <SaveWarning meta={savedMeta} onClose={onHide} /> : null}
								<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible>
									{errorMsg}
								</Alert>
								<HostConfigTestResult
									result={configTest.result}
									error={configTest.error}
									testedKey={configTest.testedKey}
									onClose={configTest.reset}
								/>
								<div className="card m-0 border-0">
									<div className="card-header">
										<ul className="nav nav-tabs card-header-tabs" data-bs-toggle="tabs">
											<li className="nav-item" role="presentation">
												<a
													href="#tab-details"
													className="nav-link active"
													data-bs-toggle="tab"
													aria-selected="true"
													role="tab"
												>
													<T id="column.details" />
												</a>
											</li>
											<li className="nav-item" role="presentation">
												<a
													href="#tab-ssl"
													className="nav-link"
													data-bs-toggle="tab"
													aria-selected="false"
													tabIndex={-1}
													role="tab"
												>
													<T id="column.ssl" />
												</a>
											</li>
											{isAdmin && (
												<li className="nav-item ms-auto" role="presentation">
													<a
														href="#tab-advanced"
														className="nav-link"
														title="Settings"
														data-bs-toggle="tab"
														aria-selected="false"
														tabIndex={-1}
														role="tab"
													>
														<IconSettings size={20} />
													</a>
												</li>
											)}
										</ul>
									</div>
									<div className="card-body">
										<div className="tab-content">
											<div className="tab-pane active show" id="tab-details" role="tabpanel">
												<DomainNamesField isWildcardPermitted dnsProviderWildcardSupported />
												<div className="row">
													<div className="col-md-4">
														<Field name="forwardScheme">
															{({ field, form }: any) => (
																<div className="mb-3">
																	<label
																		className="form-label"
																		htmlFor="forwardScheme"
																	>
																		<T id="host.forward-scheme" />
																	</label>
																	<select
																		id="forwardScheme"
																		className={`form-control ${form.errors.forwardScheme && form.touched.forwardScheme ? "is-invalid" : ""}`}
																		required
																		{...field}
																	>
																		<option value="auto">
																			<T id="auto" />
																		</option>
																		<option value="http">http</option>
																		<option value="https">https</option>
																	</select>
																	{form.errors.forwardScheme ? (
																		<div className="invalid-feedback">
																			{form.errors.forwardScheme &&
																			form.touched.forwardScheme
																				? form.errors.forwardScheme
																				: null}
																		</div>
																	) : null}
																</div>
															)}
														</Field>
													</div>
													<div className="col-md-8">
														<Field
															name="forwardDomainName"
															validate={validateString(1, 255)}
														>
															{({ field, form }: any) => (
																<div className="mb-3">
																	<label
																		className="form-label"
																		htmlFor="forwardDomainName"
																	>
																		<T id="redirection-host.forward-domain" />
																	</label>
																	<input
																		id="forwardDomainName"
																		type="text"
																		className={`form-control ${form.errors.forwardDomainName && form.touched.forwardDomainName ? "is-invalid" : ""}`}
																		required
																		placeholder="example.com"
																		{...field}
																	/>
																	{form.errors.forwardDomainName ? (
																		<div className="invalid-feedback">
																			{form.errors.forwardDomainName &&
																			form.touched.forwardDomainName
																				? form.errors.forwardDomainName
																				: null}
																		</div>
																	) : null}
																</div>
															)}
														</Field>
													</div>
												</div>
												<Field name="forwardHttpCode">
													{({ field, form }: any) => (
														<div className="mb-3">
															<label className="form-label" htmlFor="forwardHttpCode">
																<T id="redirection-host.forward-http-code" />
															</label>
															<select
																id="forwardHttpCode"
																className={`form-control ${form.errors.forwardHttpCode && form.touched.forwardHttpCode ? "is-invalid" : ""}`}
																required
																{...field}
															>
																<option value="300">
																	<T id="redirection-hosts.http-code.300" />
																</option>
																<option value="301">
																	<T id="redirection-hosts.http-code.301" />
																</option>
																<option value="302">
																	<T id="redirection-hosts.http-code.302" />
																</option>
																<option value="303">
																	<T id="redirection-hosts.http-code.303" />
																</option>
																<option value="307">
																	<T id="redirection-hosts.http-code.307" />
																</option>
																<option value="308">
																	<T id="redirection-hosts.http-code.308" />
																</option>
															</select>
															{form.errors.forwardHttpCode ? (
																<div className="invalid-feedback">
																	{form.errors.forwardHttpCode &&
																	form.touched.forwardHttpCode
																		? form.errors.forwardHttpCode
																		: null}
																</div>
															) : null}
														</div>
													)}
												</Field>
												<div className="my-3">
													<h4 className="py-2">
														<T id="options" />
													</h4>
													<div className="divide-y">
														<div>
															<label className="row" htmlFor="preservePath">
																<span className="col">
																	<T id="host.flags.preserve-path" />
																</span>
																<span className="col-auto">
																	<Field name="preservePath" type="checkbox">
																		{({ field }: any) => (
																			<label className="form-check form-check-single form-switch">
																				<input
																					{...field}
																					id="preservePath"
																					className={cn("form-check-input", {
																						"bg-yellow": field.checked,
																					})}
																					type="checkbox"
																				/>
																			</label>
																		)}
																	</Field>
																</span>
															</label>
														</div>
														<div>
															<label className="row" htmlFor="blockExploits">
																<span className="col">
																	<T id="host.flags.block-exploits" />
																</span>
																<span className="col-auto">
																	<Field name="blockExploits" type="checkbox">
																		{({ field }: any) => (
																			<label className="form-check form-check-single form-switch">
																				<input
																					{...field}
																					id="blockExploits"
																					className={cn("form-check-input", {
																						"bg-yellow": field.checked,
																					})}
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
											</div>
											<div className="tab-pane" id="tab-ssl" role="tabpanel">
												<SSLCertificateField
													name="certificateId"
													label="ssl-certificate"
													allowNew
												/>
												<SSLOptionsFields color="bg-yellow" />
											</div>
											{isAdmin && (
												<div className="tab-pane" id="tab-advanced" role="tabpanel">
													<NginxConfigField />
												</div>
											)}
										</div>
									</div>
								</div>
							</Modal.Body>
							<Modal.Footer>
								<Button data-bs-dismiss="modal" onClick={onHide} disabled={isSubmitting}>
									<T id="cancel" />
								</Button>
								<TestConfigButton
									onClick={() => {
										setErrorMsg(null);
										configTest.runTest(form, buildPayload(form.values));
									}}
									isTesting={configTest.isTesting}
									disabled={isSubmitting}
								/>
								<Button
									type="submit"
									actionType="primary"
									className="bg-yellow"
									data-bs-dismiss="modal"
									isLoading={isSubmitting}
									disabled={isSubmitting}
								>
									<T id="save" />
								</Button>
							</Modal.Footer>
						</Form>
					)}
				</FormModal>
			)}
		</>
	);
});

export { showRedirectionHostModal };
