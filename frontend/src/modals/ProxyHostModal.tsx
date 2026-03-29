import { IconSettings } from "@tabler/icons-react";
import CodeEditor from "@uiw/react-textarea-code-editor";
import cn from "classnames";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import {
	AccessField,
	Button,
	DomainNamesField,
	HasPermission,
	Loading,
	LocationsFields,
	NginxConfigField,
	SSLCertificateField,
	SSLOptionsFields,
} from "src/components";
import { useProxyHost, useSetProxyHost, useUser } from "src/hooks";
import { intl, T } from "src/locale";
import { MANAGE, PROXY_HOSTS } from "src/modules/Permissions";
import { validateNumber } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";

interface Props extends InnerModalProps {
	id: number | "new";
	isClone?: boolean;
}

const ProxyHostModal = EasyModal.create(({ id, isClone = false, visible, remove }: Props) => {
	const { data: currentUser, isLoading: userIsLoading, error: userError } = useUser("me");
	const { data, isLoading, error } = useProxyHost(id);
	const { mutate: setProxyHost } = useSetProxyHost();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [advVisible, setAdvVisible] = useState(false);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		const { ...payload } = {
			id: id === "new" || isClone ? undefined : id,
			...values,
			forwardPort: values.forwardPort || null,
		};

		setProxyHost(payload, {
			onError: (err: any) => {
				if (err.payload?.debug?.stack) {
					setErrorMsg(
						<div className="w-100">
							<T id={err.message} />
							<pre>
								<code>{err.payload.debug.stack.join("\n")}</code>
							</pre>
						</div>,
					);
				} else {
					setErrorMsg(<T id={err.message} />);
				}
			},
			onSuccess: () => {
				showObjectSuccess("proxy-host", "saved");
				remove();
			},
			onSettled: () => {
				setIsSubmitting(false);
				setSubmitting(false);
			},
		});
	};

	return (
		<Modal show={visible} onHide={remove}>
			{!isLoading && (error || userError) && (
				<Alert variant="danger" className="m-3">
					{error?.message || userError?.message || "Unknown error"}
				</Alert>
			)}
			{isLoading || (userIsLoading && <Loading noLogo />)}
			{!isLoading && !userIsLoading && data && currentUser && (
				<Formik
					initialValues={
						{
							// Details tab
							domainNames: data?.domainNames || [],
							forwardScheme: data?.forwardScheme || "http",
							forwardHost: data?.forwardHost || "",
							forwardPort: data?.forwardPort || undefined,
							accessListId: data?.accessListId || 0,
							cachingEnabled: data?.cachingEnabled || false,
							blockExploits: data?.blockExploits || false,
							allowWebsocketUpgrade: data?.allowWebsocketUpgrade || true,
							// Locations tab
							locations: data?.locations || [],
							// SSL tab
							certificateId: data?.certificateId || 0,
							sslForced: data?.sslForced || false,
							http2Support: data?.http2Support || true,
							npmplusHttp3Support: data?.npmplusHttp3Support || false,
							hstsEnabled: data?.hstsEnabled || false,
							hstsSubdomains: data?.hstsSubdomains || false,
							trustForwardedProto: data?.trustForwardedProto || false,
							// Advanced tab
							advancedConfig: data?.advancedConfig || "",
							npmplusLocationConfig: data?.npmplusLocationConfig || "",
							meta: data?.meta || {},
							npmplusNoindex: data?.npmplusNoindex || false,
							npmplusCrowdsecAppsec: data?.npmplusCrowdsecAppsec || false,
							npmplusProxyResponseBuffering: data?.npmplusProxyResponseBuffering || false,
							npmplusProxyRequestBuffering: data?.npmplusProxyRequestBuffering || false,
							npmplusUpstreamCompression: data?.npmplusUpstreamCompression || false,
							npmplusFancyindex: data?.npmplusFancyindex || false,
							npmplusXFrameOptions: data?.npmplusXFrameOptions || "SAMEORIGIN",
							npmplusAuthRequest: data?.npmplusAuthRequest || "none",
						} as any
					}
					onSubmit={onSubmit}
				>
					{() => (
						<Form>
							<Modal.Header closeButton>
								<Modal.Title>
									<T
										id={isClone ? "object.add" : data?.id ? "object.edit" : "object.add"}
										tData={{ object: "proxy-host" }}
									/>
								</Modal.Title>
							</Modal.Header>
							<Modal.Body className="p-0">
								<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible>
									{errorMsg}
								</Alert>
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
													href="#tab-locations"
													className="nav-link"
													data-bs-toggle="tab"
													aria-selected="false"
													tabIndex={-1}
													role="tab"
												>
													<T id="column.custom-locations" />
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
										</ul>
									</div>
									<div className="card-body">
										<div className="tab-content">
											<div className="tab-pane active show" id="tab-details" role="tabpanel">
												<DomainNamesField isWildcardPermitted dnsProviderWildcardSupported />
												<div className="row">
													<div className="col-md-3">
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
																		className={`form-select ${form.errors.forwardScheme && form.touched.forwardScheme ? "is-invalid" : ""}`}
																		required
																		{...field}
																	>
																		<option value="http">http://</option>
																		<option value="https">https://</option>
																		<option value="path">path: </option>
																		<option value="empty">empty</option>
																		<option value="grpc">grpc://</option>
																		<option value="grpcs">grpcs://</option>
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
													<div className="col-md-5">
														<Field name="forwardHost">
															{({ field, form }: any) => (
																<div className="mb-3">
																	<label className="form-label" htmlFor="forwardHost">
																		<T id="proxy-host.forward-host-path" />
																	</label>
																	<input
																		id="forwardHost"
																		type="text"
																		className={`form-control ${form.errors.forwardHost && form.touched.forwardHost ? "is-invalid" : ""}`}
																		placeholder="example.com"
																		{...field}
																	/>
																	{form.errors.forwardHost ? (
																		<div className="invalid-feedback">
																			{form.errors.forwardHost &&
																			form.touched.forwardHost
																				? form.errors.forwardHost
																				: null}
																		</div>
																	) : null}
																</div>
															)}
														</Field>
													</div>
													<div className="col-md-3">
														<Field name="forwardPort" validate={validateNumber(-1, 65535)}>
															{({ field, form }: any) => (
																<div className="mb-3">
																	<label className="form-label" htmlFor="forwardPort">
																		<T id="host.forward-port" />
																	</label>
																	<input
																		id="forwardPort"
																		type="text"
																		inputMode="numeric"
																		pattern="[0-9]*"
																		className={`form-control ${form.errors.forwardPort && form.touched.forwardPort ? "is-invalid" : ""}`}
																		placeholder="eg: 8081"
																		{...field}
																	/>
																	{form.errors.forwardPort ? (
																		<div className="invalid-feedback">
																			{form.errors.forwardPort &&
																			form.touched.forwardPort
																				? form.errors.forwardPort
																				: null}
																		</div>
																	) : null}
																</div>
															)}
														</Field>
													</div>
													<div className="col-md-1 text-end">
														<div className="mb-3">
															<div className="form-label invisible">​</div>
															<button
																type="button"
																className="btn p-0"
																title="LocationConfig"
																onClick={() => setAdvVisible((prev) => !prev)}
															>
																<IconSettings size={20} />
															</button>
														</div>
													</div>
												</div>
												<AccessField />
												<div className="my-3">
													<h4 className="py-2">
														<T id="options" />
													</h4>
													<div className="divide-y">
														<div style={{ display: "none" }}>
															<label className="row" htmlFor="cachingEnabled">
																<span className="col">
																	<T id="host.flags.cache-assets" />
																</span>
																<span className="col-auto">
																	<Field name="cachingEnabled" type="checkbox">
																		{({ field }: any) => (
																			<label className="form-check form-check-single form-switch">
																				<input
																					{...field}
																					id="cachingEnabled"
																					className={cn("form-check-input", {
																						"bg-lime": field.checked,
																					})}
																					type="checkbox"
																				/>
																			</label>
																		)}
																	</Field>
																</span>
															</label>
														</div>
														<div style={{ display: "none" }}>
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
																						"bg-lime": field.checked,
																					})}
																					type="checkbox"
																				/>
																			</label>
																		)}
																	</Field>
																</span>
															</label>
														</div>
														<div style={{ display: "none" }}>
															<label className="row" htmlFor="allowWebsocketUpgrade">
																<span className="col">
																	<T id="host.flags.websockets-upgrade" />
																</span>
																<span className="col-auto">
																	<Field name="allowWebsocketUpgrade" type="checkbox">
																		{({ field }: any) => (
																			<label className="form-check form-check-single form-switch">
																				<input
																					{...field}
																					id="allowWebsocketUpgrade"
																					className={cn("form-check-input", {
																						"bg-lime": field.checked,
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
															<label className="row" htmlFor="npmplusNoindex">
																<span className="col">
																	<T id="host.flags.send-noindex" />
																</span>
																<span className="col-auto">
																	<Field name="npmplusNoindex" type="checkbox">
																		{({ field }: any) => (
																			<label className="form-check form-check-single form-switch">
																				<input
																					{...field}
																					id="npmplusNoindex"
																					className={cn("form-check-input", {
																						"bg-lime": field.checked,
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
															<label className="row" htmlFor="npmplusCrowdsecAppsec">
																<span className="col">
																	<T id="host.flags.disable-crowdsec-appsec" />
																</span>
																<span className="col-auto">
																	<Field name="npmplusCrowdsecAppsec" type="checkbox">
																		{({ field, form }: any) => (
																			<label className="form-check form-check-single form-switch">
																				<input
																					{...field}
																					id="npmplusCrowdsecAppsec"
																					className={cn("form-check-input", {
																						"bg-lime": field.checked,
																					})}
																					type="checkbox"
																					onChange={(e) => {
																						field.onChange(e);
																						if (!e.target.checked)
																							form.setFieldValue(
																								"npmplusProxyRequestBuffering",
																								false,
																							);
																					}}
																				/>
																			</label>
																		)}
																	</Field>
																</span>
															</label>
														</div>
														<div>
															<label
																className="row"
																htmlFor="npmplusProxyRequestBuffering"
															>
																<span className="col">
																	<T id="host.flags.disable-request-buffering" />
																</span>
																<span className="col-auto">
																	<Field
																		name="npmplusProxyRequestBuffering"
																		type="checkbox"
																	>
																		{({ field, form }: any) => (
																			<label className="form-check form-check-single form-switch">
																				<input
																					{...field}
																					id="npmplusProxyRequestBuffering"
																					className={cn("form-check-input", {
																						"bg-lime": field.checked,
																					})}
																					type="checkbox"
																					onChange={(e) => {
																						field.onChange(e);
																						if (e.target.checked)
																							form.setFieldValue(
																								"npmplusCrowdsecAppsec",
																								true,
																							);
																					}}
																					disabled={
																						form.values.forwardScheme !==
																							"http" &&
																						form.values.forwardScheme !==
																							"https"
																					}
																				/>
																			</label>
																		)}
																	</Field>
																</span>
															</label>
														</div>
														<div>
															<label
																className="row"
																htmlFor="npmplusProxyResponseBuffering"
															>
																<span className="col">
																	<T id="host.flags.disable-response-buffering" />
																</span>
																<span className="col-auto">
																	<Field
																		name="npmplusProxyResponseBuffering"
																		type="checkbox"
																	>
																		{({ field, form }: any) => (
																			<label className="form-check form-check-single form-switch">
																				<input
																					{...field}
																					id="npmplusProxyResponseBuffering"
																					className={cn("form-check-input", {
																						"bg-lime": field.checked,
																					})}
																					type="checkbox"
																					disabled={
																						form.values.forwardScheme !==
																							"http" &&
																						form.values.forwardScheme !==
																							"https"
																					}
																				/>
																			</label>
																		)}
																	</Field>
																</span>
															</label>
														</div>
														<div>
															<label className="row" htmlFor="npmplusUpstreamCompression">
																<span className="col">
																	<T id="host.flags.upstream-compression" />
																</span>
																<span className="col-auto">
																	<Field
																		name="npmplusUpstreamCompression"
																		type="checkbox"
																	>
																		{({ field, form }: any) => (
																			<label className="form-check form-check-single form-switch">
																				<input
																					{...field}
																					id="npmplusUpstreamCompression"
																					className={cn("form-check-input", {
																						"bg-lime": field.checked,
																					})}
																					type="checkbox"
																					disabled={
																						form.values.forwardScheme ===
																						"path"
																					}
																				/>
																			</label>
																		)}
																	</Field>
																</span>
															</label>
														</div>
														<div>
															<label className="row" htmlFor="npmplusFancyindex">
																<span className="col">
																	<T id="host.flags.fancyindex" />
																</span>
																<span className="col-auto">
																	<Field name="npmplusFancyindex" type="checkbox">
																		{({ field, form }: any) => (
																			<label className="form-check form-check-single form-switch">
																				<input
																					{...field}
																					id="npmplusFancyindex"
																					className={cn("form-check-input", {
																						"bg-lime": field.checked,
																					})}
																					type="checkbox"
																					disabled={
																						form.values.forwardScheme !==
																						"path"
																					}
																				/>
																			</label>
																		)}
																	</Field>
																</span>
															</label>
														</div>
														<div>
															<label className="row" htmlFor="npmplusXFrameOptions">
																<span className="col">X-Frame-Options</span>
																<span className="col-auto">
																	<Field name="npmplusXFrameOptions">
																		{({ field, form }: any) => (
																			<label>
																				<select
																					id="npmplusXFrameOptions"
																					className={`form-select ${form.errors.npmplusXFrameOptions && form.touched.npmplusXFrameOptions ? "is-invalid" : ""}`}
																					required
																					{...field}
																				>
																					<option value="SAMEORIGIN">
																						SAMEORIGIN
																					</option>
																					<option value="DENY">DENY</option>
																					<option value="none">none</option>
																					<option value="upstream">
																						upstream
																					</option>
																				</select>
																				{form.errors.npmplusXFrameOptions ? (
																					<div className="invalid-feedback">
																						{form.errors
																							.npmplusXFrameOptions &&
																						form.touched
																							.npmplusXFrameOptions
																							? form.errors
																									.npmplusXFrameOptions
																							: null}
																					</div>
																				) : null}
																			</label>
																		)}
																	</Field>
																</span>
															</label>
														</div>
														<div>
															<label className="row" htmlFor="npmplusAuthRequest">
																<span className="col">Auth Request</span>
																<span className="col-auto">
																	<Field name="npmplusAuthRequest">
																		{({ field, form }: any) => (
																			<label>
																				<select
																					id="npmplusAuthRequest"
																					className={`form-select ${form.errors.npmplusAuthRequest && form.touched.npmplusAuthRequest ? "is-invalid" : ""}`}
																					required
																					{...field}
																				>
																					<option value="none">none</option>
																					<option value="anubis">
																						anubis
																					</option>
																					<option value="tinyauth">
																						tinyauth
																					</option>
																					<option value="oauth2proxy">
																						oauth2proxy
																					</option>
																					<option value="authelia">
																						authelia (modern)
																					</option>
																					<option value="authentik">
																						authentik
																					</option>
																					<option value="authentik-send-basic-auth">
																						authentik-send-basic-auth
																					</option>
																				</select>
																				{form.errors.npmplusAuthRequest ? (
																					<div className="invalid-feedback">
																						{form.errors
																							.npmplusAuthRequest &&
																						form.touched.npmplusAuthRequest
																							? form.errors
																									.npmplusAuthRequest
																							: null}
																					</div>
																				) : null}
																			</label>
																		)}
																	</Field>
																</span>
															</label>
														</div>
													</div>
												</div>
												<Field name="npmplusLocationConfig">
													{({ field }: any) => (
														<>
															{advVisible && (
																<div className="">
																	<CodeEditor
																		language="nginx"
																		placeholder={intl.formatMessage({
																			id: "nginx-config.placeholder",
																		})}
																		padding={15}
																		data-color-mode="dark"
																		minHeight={170}
																		indentWidth={2}
																		style={{
																			fontFamily:
																				"ui-monospace,SFMono-Regular,SF Mono,Consolas,Liberation Mono,Menlo,monospace",
																			borderRadius: "0.3rem",
																			minHeight: "170px",
																		}}
																		{...field}
																	/>
																</div>
															)}
														</>
													)}
												</Field>
											</div>
											<div className="tab-pane" id="tab-locations" role="tabpanel">
												<LocationsFields initialValues={data?.locations || []} />
											</div>
											<div className="tab-pane" id="tab-ssl" role="tabpanel">
												<SSLCertificateField
													name="certificateId"
													label="ssl-certificate"
													allowNew
												/>
												<SSLOptionsFields color="bg-lime" forProxyHost={true} />
											</div>
											<div className="tab-pane" id="tab-advanced" role="tabpanel">
												<NginxConfigField />
											</div>
										</div>
									</div>
								</div>
							</Modal.Body>
							<Modal.Footer>
								<Button data-bs-dismiss="modal" onClick={remove} disabled={isSubmitting}>
									<T id="cancel" />
								</Button>
								<HasPermission section={PROXY_HOSTS} permission={MANAGE} hideError>
									<Button
										type="submit"
										actionType="primary"
										className="ms-auto bg-lime"
										data-bs-dismiss="modal"
										isLoading={isSubmitting}
										disabled={isSubmitting}
									>
										<T id="save" />
									</Button>
								</HasPermission>
							</Modal.Footer>
						</Form>
					)}
				</Formik>
			)}
		</Modal>
	);
});

const showProxyHostModal = (id: number | "new", isClone = false) => {
	EasyModal.show(ProxyHostModal, { id, isClone } as Omit<Props, "visible" | "remove">);
};

export { showProxyHostModal };
