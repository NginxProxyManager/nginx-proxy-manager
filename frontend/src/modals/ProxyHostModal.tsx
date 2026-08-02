import { IconHelpCircle } from "@tabler/icons-react";
import cn from "classnames";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { type ReactNode, useState } from "react";
import { Alert, Modal } from "react-bootstrap";
import { type ProxyHost, type ProxyHostPreview, previewProxyHostNginxConfig } from "src/api/backend";
import {
	AccessField,
	Button,
	DomainNamesField,
	HasPermission,
	Loading,
	LocationsFields,
	NginxConfigField,
	ProxyDirectivesFields,
	SSLCertificateField,
	SSLOptionsFields,
} from "src/components";
import { useProxyHost, useSetProxyHost, useUser } from "src/hooks";
import { intl, T } from "src/locale";
import { MANAGE, PROXY_HOSTS } from "src/modules/Permissions";
import { validateNumber, validateString } from "src/modules/Validations";
import { showError, showObjectSuccess } from "src/notifications";

const wizardSteps = [
	{ id: "server", title: "proxy-host.wizard.server", description: "proxy-host.wizard.server.help" },
	{ id: "tls", title: "proxy-host.wizard.tls", description: "proxy-host.wizard.tls.help" },
	{ id: "upstream", title: "proxy-host.wizard.upstream", description: "proxy-host.wizard.upstream.help" },
	{ id: "locations", title: "proxy-host.wizard.locations", description: "proxy-host.wizard.locations.help" },
	{ id: "preview", title: "proxy-host.wizard.preview", description: "proxy-host.wizard.preview.help" },
] as const;

const previewStepIndex = wizardSteps.length - 1;

const isDefaultLocationEnabled = (values: any) => values.nginxConfig?.server?.defaultLocationEnabled !== false;
const isPortListener = (values: any) => values.nginxConfig?.listener?.mode === "port";
const reservedListenerPorts = new Set([80, 81, 443]);
const validateListenerPort = (value: string) => {
	const numberError = validateNumber(1, 65535)(value);
	if (numberError) return numberError;
	const port = Number(value);
	if (!Number.isInteger(port)) return intl.formatMessage({ id: "proxy-host.wizard.validation.listener-port" });
	if (reservedListenerPorts.has(port))
		return intl.formatMessage({ id: "proxy-host.wizard.validation.listener-port-reserved" });
};

const optionalIntegerFields = [
	"proxyHeadersHashBucketSize",
	"proxyHeadersHashMaxSize",
	"proxyNextUpstreamTries",
	"proxySslVerifyDepth",
];

const normalizeProxyOptionsForApi = (options: any = {}) => {
	const result = { ...options };
	for (const key of optionalIntegerFields) {
		if (result[key] === "" || typeof result[key] === "undefined") {
			delete result[key];
		} else {
			result[key] = Number(result[key]);
		}
	}
	if (Array.isArray(result.proxyBuffers)) {
		const [count, size] = result.proxyBuffers;
		if (count === "" || typeof count === "undefined" || !size) delete result.proxyBuffers;
		else result.proxyBuffers = [Number(count), size];
	}
	for (const [inputKey, targetKey] of [
		["hideResponseHeadersInput", "hideResponseHeaders"],
		["proxyPassHeadersInput", "proxyPassHeaders"],
	] as const) {
		if (typeof result[inputKey] === "string") {
			const values = result[inputKey]
				.split(",")
				.map((value: string) => value.trim())
				.filter(Boolean);
			if (values.length) result[targetKey] = values;
			else delete result[targetKey];
		}
		delete result[inputKey];
	}
	for (const key of Object.keys(result)) {
		if (result[key] === "") delete result[key];
	}
	return result;
};

const prepareProxyHostValues = (values: any) => {
	const portListener = isPortListener(values);
	const nginxConfig = {
		...values.nginxConfig,
		server: normalizeProxyOptionsForApi(values.nginxConfig?.server),
	};
	if (portListener) {
		nginxConfig.listener = { mode: "port", port: Number(values.nginxConfig?.listener?.port) };
	} else {
		delete nginxConfig.listener;
	}
	const prepared = {
		...values,
		...(portListener
			? {
					domainNames: [],
					certificateId: 0,
					sslForced: false,
					http2Support: false,
					hstsEnabled: false,
					hstsSubdomains: false,
				}
			: {}),
		nginxConfig,
		locations: (values.locations || []).map((location: any) => ({
			...location,
			nginxConfig: normalizeProxyOptionsForApi(location.nginxConfig),
		})),
	};
	if (isDefaultLocationEnabled(prepared)) return prepared;

	return {
		...prepared,
		// The legacy API/database columns remain non-nullable. These values are
		// intentionally inert because the renderer omits the managed location /.
		forwardScheme: prepared.forwardScheme || "http",
		forwardHost: String(prepared.forwardHost || "").trim() || "127.0.0.1",
		forwardPort: Number(prepared.forwardPort) || 80,
	};
};

const showProxyHostModal = (id: number | "new") => {
	EasyModal.show(ProxyHostModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "new";
}

interface SwitchFieldProps {
	name: string;
	label: string;
	help?: string;
}

interface FieldLabelWithHelpProps {
	htmlFor: string;
	label: string;
	help: string;
}

function FieldLabelWithHelp({ htmlFor, label, help }: FieldLabelWithHelpProps) {
	const description = intl.formatMessage({ id: help });
	return (
		<label className="form-label" htmlFor={htmlFor}>
			<T id={label} />
			<span
				className="ms-1 text-secondary align-text-bottom"
				role="img"
				title={description}
				aria-label={description}
			>
				<IconHelpCircle size={15} stroke={1.8} aria-hidden="true" />
			</span>
		</label>
	);
}

function SwitchField({ name, label, help }: SwitchFieldProps) {
	return (
		<Field name={name}>
			{({ field, form }: any) => (
				<label className="row py-2" htmlFor={name}>
					<span className="col">
						<span className="d-block">
							<T id={label} />
						</span>
						{help ? (
							<span className="d-block small text-secondary">
								<T id={help} />
							</span>
						) : null}
					</span>
					<span className="col-auto">
						<span className="form-check form-check-single form-switch">
							<input
								id={name}
								name={field.name}
								checked={field.value === true}
								className={cn("form-check-input", { "bg-lime": field.value === true })}
								onBlur={field.onBlur}
								onChange={(event) => form.setFieldValue(name, event.currentTarget.checked)}
								type="checkbox"
							/>
						</span>
					</span>
				</label>
			)}
		</Field>
	);
}

function ListenerFields() {
	return (
		<Field name="nginxConfig.listener.mode">
			{({ field, form }: any) => {
				const portMode = field.value === "port";
				const setMode = (mode: "domain" | "port") => {
					form.setFieldValue(field.name, mode);
					if (mode === "port") {
						form.setFieldValue("domainNames", []);
						form.setFieldValue("certificateId", 0);
						form.setFieldValue("sslForced", false);
						form.setFieldValue("http2Support", false);
						form.setFieldValue("hstsEnabled", false);
						form.setFieldValue("hstsSubdomains", false);
					}
				};
				return (
					<div className="card mb-3">
						<div className="card-body">
							<h4 className="mb-1">
								<T id="proxy-host.wizard.listener" />
							</h4>
							<p className="small text-secondary">
								<T id="proxy-host.wizard.listener.help" />
							</p>
							<div
								className="btn-group w-100 mb-1"
								role="group"
								aria-label={intl.formatMessage({ id: "proxy-host.wizard.listener" })}
							>
								<button
									type="button"
									className={cn("btn", !portMode ? "btn-lime" : "btn-outline-secondary")}
									onClick={() => setMode("domain")}
								>
									<T id="proxy-host.wizard.listener.domain" />
								</button>
								<button
									type="button"
									className={cn("btn", portMode ? "btn-lime" : "btn-outline-secondary")}
									onClick={() => setMode("port")}
								>
									<T id="proxy-host.wizard.listener.port" />
								</button>
							</div>
							<p className="form-hint mb-3">
								<T
									id={
										portMode
											? "proxy-host.wizard.listener.port-mode.help"
											: "proxy-host.wizard.listener.domain.help"
									}
								/>
							</p>
							{portMode ? (
								<div className="row align-items-end">
									<div className="col-md-5">
										<Field name="nginxConfig.listener.port" validate={validateListenerPort}>
											{({ field: portField, form: portForm }: any) => (
												<div className="mb-0">
													<label className="form-label" htmlFor="listenerPort">
														{intl.formatMessage({
															id: "proxy-host.wizard.listener.port-number",
														})}
													</label>
													<input
														id="listenerPort"
														type="number"
														min="1"
														max="65535"
														required
														className={cn("form-control", {
															"is-invalid":
																portForm.errors.nginxConfig?.listener?.port &&
																portForm.touched.nginxConfig?.listener?.port,
														})}
														{...portField}
													/>
													{portForm.errors.nginxConfig?.listener?.port &&
													portForm.touched.nginxConfig?.listener?.port ? (
														<small className="text-danger">
															{portForm.errors.nginxConfig.listener.port}
														</small>
													) : null}
												</div>
											)}
										</Field>
									</div>
									<div className="col-md-7">
										<p className="small text-secondary mb-0">
											<T id="proxy-host.wizard.listener.port.help" />
										</p>
									</div>
								</div>
							) : null}
						</div>
					</div>
				);
			}}
		</Field>
	);
}

function StepHeading({ title, description }: { title: string; description: string }) {
	return (
		<div className="mb-4">
			<h3 className="mb-1">
				<T id={title} />
			</h3>
			<p className="text-secondary mb-0">
				<T id={description} />
			</p>
		</div>
	);
}

const ProxyHostModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const { data: currentUser, isLoading: userIsLoading, error: userError } = useUser("me");
	const { data, isLoading, error } = useProxyHost(id);
	const { mutate: setProxyHost } = useSetProxyHost();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [activeStep, setActiveStep] = useState(0);
	const [previewResult, setPreviewResult] = useState<ProxyHostPreview | null>(null);
	const [isPreviewing, setIsPreviewing] = useState(false);
	const [previewToken, setPreviewToken] = useState<string | null>(null);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting || !previewResult?.valid) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		const payload = {
			id: id === "new" ? undefined : id,
			// Preview tokens currently protect updates against stale revisions. New
			// hosts do not have a durable identity/revision to bind yet.
			previewToken: id === "new" ? undefined : previewToken || undefined,
			...prepareProxyHostValues(values),
		};

		setProxyHost(payload, {
			onError: (err: any) => setErrorMsg(<T id={err.message} />),
			onSuccess: (saved: ProxyHost) => {
				if (["error", "degraded"].includes(saved.nginxDeploymentStatus || "")) {
					const savedMessage = intl.formatMessage(
						{ id: "notification.object-saved" },
						{ object: intl.formatMessage({ id: "proxy-host" }) },
					);
					const statusMessage = intl.formatMessage({
						id: `nginx-deployment.status.${saved.nginxDeploymentStatus}`,
					});
					const detail = saved.nginxLastError?.message ? `: ${saved.nginxLastError.message}` : "";
					showError(`${savedMessage}. Nginx: ${statusMessage}${detail}`);
				} else {
					showObjectSuccess("proxy-host", "saved");
				}
				remove();
			},
			onSettled: () => {
				setIsSubmitting(false);
				setSubmitting(false);
			},
		});
	};

	const validateRequiredStep = (step: number, values: any) => {
		if (step === 0) {
			if (isPortListener(values)) {
				const port = Number(values.nginxConfig?.listener?.port);
				if (!Number.isInteger(port) || port < 1 || port > 65535) {
					setErrorMsg(<T id="proxy-host.wizard.validation.listener-port" />);
					return false;
				}
				if (reservedListenerPorts.has(port)) {
					setErrorMsg(<T id="proxy-host.wizard.validation.listener-port-reserved" />);
					return false;
				}
			} else if (!Array.isArray(values.domainNames) || values.domainNames.length === 0) {
				setErrorMsg(<T id="proxy-host.wizard.validation.domain" />);
				return false;
			}
		}
		if (step === 2 && isDefaultLocationEnabled(values)) {
			const port = Number(values.forwardPort);
			if (!String(values.forwardHost || "").trim() || !Number.isInteger(port) || port < 1 || port > 65535) {
				setErrorMsg(<T id="proxy-host.wizard.validation.upstream" />);
				return false;
			}
		}
		if (step === 3) {
			const invalidLocation = (values.locations || []).some((location: any) => {
				const port = Number(location.forwardPort);
				return (
					!String(location.path || "").trim() ||
					!String(location.forwardHost || "").trim() ||
					!Number.isInteger(port) ||
					port < 1 ||
					port > 65535
				);
			});
			if (invalidLocation) {
				setErrorMsg(<T id="proxy-host.wizard.validation.locations" />);
				return false;
			}
		}
		setErrorMsg(null);
		return true;
	};

	const runPreview = async (values: any) => {
		setIsPreviewing(true);
		setErrorMsg(null);
		setPreviewResult(null);
		setPreviewToken(null);
		try {
			const result = await previewProxyHostNginxConfig({
				...prepareProxyHostValues(values),
				hostId: data?.id || undefined,
			});
			setPreviewResult(result);
			setPreviewToken(result.previewToken || null);
			if (!result.valid) setErrorMsg(<T id="proxy-host.wizard.preview.invalid" />);
		} catch (previewError: any) {
			setErrorMsg(previewError.message);
		} finally {
			setIsPreviewing(false);
		}
	};

	return (
		<Modal show={visible} onHide={remove} size="xl" centered scrollable>
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
							domainNames: data?.domainNames || [],
							enabled: data?.enabled ?? true,
							forwardScheme: data?.forwardScheme || "http",
							forwardHost: data?.forwardHost || "",
							forwardPort: data?.forwardPort || undefined,
							accessListId: data?.accessListId || 0,
							cachingEnabled: data?.cachingEnabled || false,
							blockExploits: data?.blockExploits || false,
							allowWebsocketUpgrade: data?.allowWebsocketUpgrade || false,
							locations: (data?.locations || []).map((location: any) => ({
								...location,
								nginxConfig: {
									...(location.nginxConfig || {}),
									hideResponseHeadersInput:
										location.nginxConfig?.hideResponseHeaders?.join(", ") || "",
									proxyPassHeadersInput: location.nginxConfig?.proxyPassHeaders?.join(", ") || "",
								},
							})),
							certificateId: data?.certificateId || 0,
							sslForced: data?.sslForced || false,
							http2Support: data?.http2Support || false,
							hstsEnabled: data?.hstsEnabled || false,
							hstsSubdomains: data?.hstsSubdomains || false,
							trustForwardedProto: data?.trustForwardedProto || false,
							nginxConfig: {
								...(data?.nginxConfig || { schemaVersion: 1 }),
								schemaVersion: data?.nginxConfig?.schemaVersion || 1,
								server: {
									...(data?.nginxConfig?.server || {}),
									defaultLocationEnabled: data?.nginxConfig?.server?.defaultLocationEnabled ?? true,
									proxyBuffering: data?.nginxConfig?.server?.proxyBuffering ?? true,
									proxyRequestBuffering: data?.nginxConfig?.server?.proxyRequestBuffering ?? true,
									proxySslServerName: data?.nginxConfig?.server?.proxySslServerName ?? false,
									hideResponseHeadersInput:
										data?.nginxConfig?.server?.hideResponseHeaders?.join(", ") || "",
									proxyPassHeadersInput:
										data?.nginxConfig?.server?.proxyPassHeaders?.join(", ") || "",
								},
							},
							baseRevision: data?.nginxConfigRevision,
							advancedConfig: data?.advancedConfig || "",
							meta: data?.meta || {},
						} as any
					}
					onSubmit={onSubmit}
				>
					{({ values }) => {
						const goBack = () => {
							if (activeStep === 0) return;
							setActiveStep((step) => step - 1);
							setPreviewResult(null);
							setPreviewToken(null);
							setErrorMsg(null);
						};

						const goNext = async () => {
							if (!validateRequiredStep(activeStep, values)) return;
							const nextStep = Math.min(activeStep + 1, previewStepIndex);
							setActiveStep(nextStep);
							if (nextStep === previewStepIndex) await runPreview(values);
						};

						return (
							<Form
								className="d-flex flex-column overflow-hidden"
								style={{ maxHeight: "calc(100vh - 3.5rem)", minHeight: 0 }}
							>
								<Modal.Header closeButton className="flex-shrink-0">
									<div>
										<Modal.Title>
											<T
												id={data?.id ? "object.edit" : "object.add"}
												tData={{ object: "proxy-host" }}
											/>
										</Modal.Title>
										<div className="small text-secondary mt-1">
											<T id="proxy-host.wizard.subtitle" />
										</div>
									</div>
								</Modal.Header>
								<Modal.Body className="p-0 overflow-y-auto" style={{ minHeight: 0 }}>
									{errorMsg ? (
										<Alert
											variant="danger"
											className="m-3 mb-0"
											onClose={() => setErrorMsg(null)}
											dismissible
										>
											{errorMsg}
										</Alert>
									) : null}

									<div className="border-bottom px-3 px-lg-4 py-3 bg-body-tertiary">
										<div className="progress mb-3" style={{ height: 4 }} aria-hidden="true">
											<div
												className="progress-bar bg-lime"
												style={{ width: `${((activeStep + 1) / wizardSteps.length) * 100}%` }}
											/>
										</div>
										<div
											className="d-flex gap-2 overflow-auto pb-1"
											role="tablist"
											aria-label={intl.formatMessage({ id: "proxy-host.wizard.subtitle" })}
										>
											{wizardSteps.map((step, index) => (
												<button
													type="button"
													key={step.id}
													className={cn(
														"btn btn-sm text-nowrap",
														index === activeStep ? "btn-lime" : "btn-outline-secondary",
													)}
													onClick={() => {
														if (index <= activeStep) {
															setActiveStep(index);
															if (index !== previewStepIndex) {
																setPreviewResult(null);
																setPreviewToken(null);
															}
														}
													}}
													disabled={index > activeStep}
													aria-selected={index === activeStep}
													role="tab"
												>
													<span className="me-1">{index + 1}.</span>
													<T id={step.title} />
												</button>
											))}
										</div>
									</div>

									<div className="p-3 p-lg-4" style={{ minHeight: 430 }}>
										{activeStep === 0 ? (
											<section>
												<StepHeading
													title={wizardSteps[0].title}
													description={wizardSteps[0].description}
												/>
												<ListenerFields />
												{isPortListener(values) ? (
													<Alert variant="info" className="mb-3">
														<T id="proxy-host.wizard.listener.port.tls-help" />
													</Alert>
												) : (
													<div className="card mb-3">
														<div className="card-body">
															<h4 className="mb-1">server_name</h4>
															<p className="small text-secondary">
																<T id="proxy-host.wizard.server-name.help" />
															</p>
															<DomainNamesField
																isWildcardPermitted
																dnsProviderWildcardSupported
															/>
														</div>
													</div>
												)}
												<div className="card">
													<div className="card-body">
														<h4>
															<T id="proxy-host.wizard.access" />
														</h4>
														<AccessField />
														<div className="divide-y">
															<SwitchField
																name="blockExploits"
																label="host.flags.block-exploits"
																help="proxy-host.wizard.block-exploits.help"
															/>
														</div>
													</div>
												</div>
												<div className="card mt-3">
													<div className="card-body">
														<ProxyDirectivesFields
															name="nginxConfig.server"
															scope="server"
														/>
													</div>
												</div>
												<p className="small text-secondary mt-3">
													<T id="nginx-options.unavailable-help" />
												</p>
												<div className="card">
													<div className="card-body">
														<h4 className="mb-1">
															<T id="proxy-host.wizard.advanced" />
														</h4>
														<p className="small text-secondary">
															<T id="proxy-host.wizard.advanced.help" />
														</p>
														<NginxConfigField />
													</div>
												</div>
											</section>
										) : null}

										{activeStep === 1 ? (
											<section>
												<StepHeading
													title={wizardSteps[1].title}
													description={wizardSteps[1].description}
												/>
												{isPortListener(values) ? (
													<Alert variant="info">
														<T id="proxy-host.wizard.listener.port.tls-help" />
													</Alert>
												) : (
													<div className="card">
														<div className="card-body">
															<SSLCertificateField
																name="certificateId"
																label="ssl-certificate"
																allowNew
															/>
															<SSLOptionsFields color="bg-lime" forProxyHost />
														</div>
													</div>
												)}
											</section>
										) : null}

										{activeStep === 2 ? (
											<section>
												<StepHeading
													title={wizardSteps[2].title}
													description={wizardSteps[2].description}
												/>
												<div className="card mb-3">
													<div className="card-body">
														<SwitchField
															name="nginxConfig.server.defaultLocationEnabled"
															label="proxy-host.wizard.default-location.enabled"
															help="proxy-host.wizard.default-location.enabled.help"
														/>

														{isDefaultLocationEnabled(values) ? (
															<>
																<hr className="my-3" />
																<h4 className="mb-1">location / → proxy_pass</h4>
																<p className="small text-secondary">
																	<T id="proxy-host.wizard.default-location.help" />
																</p>
																<div className="row">
																	<div className="col-md-3">
																		<Field name="forwardScheme">
																			{({ field, form }: any) => (
																				<div className="mb-3">
																					<FieldLabelWithHelp
																						htmlFor="forwardScheme"
																						label="host.forward-scheme"
																						help="host.forward-scheme.help"
																					/>
																					<select
																						id="forwardScheme"
																						className={cn("form-control", {
																							"is-invalid":
																								form.errors
																									.forwardScheme &&
																								form.touched
																									.forwardScheme,
																						})}
																						required
																						{...field}
																					>
																						<option value="http">
																							http
																						</option>
																						<option value="https">
																							https
																						</option>
																					</select>
																				</div>
																			)}
																		</Field>
																	</div>
																	<div className="col-md-6">
																		<Field
																			name="forwardHost"
																			validate={validateString(1, 255)}
																		>
																			{({ field, form }: any) => (
																				<div className="mb-3">
																					<FieldLabelWithHelp
																						htmlFor="forwardHost"
																						label="proxy-host.forward-host"
																						help="proxy-host.forward-host.help"
																					/>
																					<input
																						id="forwardHost"
																						type="text"
																						className={cn("form-control", {
																							"is-invalid":
																								form.errors
																									.forwardHost &&
																								form.touched
																									.forwardHost,
																						})}
																						required
																						placeholder="10.0.0.10"
																						{...field}
																					/>
																					{form.errors.forwardHost &&
																					form.touched.forwardHost ? (
																						<div className="invalid-feedback">
																							{form.errors.forwardHost}
																						</div>
																					) : null}
																				</div>
																			)}
																		</Field>
																	</div>
																	<div className="col-md-3">
																		<Field
																			name="forwardPort"
																			validate={validateNumber(1, 65535)}
																		>
																			{({ field, form }: any) => (
																				<div className="mb-3">
																					<FieldLabelWithHelp
																						htmlFor="forwardPort"
																						label="host.forward-port"
																						help="host.forward-port.help"
																					/>
																					<input
																						id="forwardPort"
																						type="number"
																						min={1}
																						max={65535}
																						className={cn("form-control", {
																							"is-invalid":
																								form.errors
																									.forwardPort &&
																								form.touched
																									.forwardPort,
																						})}
																						required
																						placeholder="8080"
																						{...field}
																					/>
																					{form.errors.forwardPort &&
																					form.touched.forwardPort ? (
																						<div className="invalid-feedback">
																							{form.errors.forwardPort}
																						</div>
																					) : null}
																				</div>
																			)}
																		</Field>
																	</div>
																</div>
															</>
														) : (
															<Alert variant="info" className="mt-3 mb-0">
																<T id="proxy-host.wizard.default-location.disabled.help" />
															</Alert>
														)}
													</div>
												</div>
												<div className="card">
													<div className="card-body">
														<h4>
															<T id="proxy-host.wizard.upstream-behaviour" />
														</h4>
														<div className="divide-y">
															<SwitchField
																name="allowWebsocketUpgrade"
																label="host.flags.websockets-upgrade"
																help="proxy-host.wizard.websocket.help"
															/>
															<SwitchField
																name="cachingEnabled"
																label="host.flags.cache-assets"
																help="proxy-host.wizard.cache.help"
															/>
														</div>
													</div>
												</div>
											</section>
										) : null}

										{activeStep === 3 ? (
											<section>
												<StepHeading
													title={wizardSteps[3].title}
													description={wizardSteps[3].description}
												/>
												<LocationsFields
													initialValues={data?.locations || []}
													defaultLocationEnabled={isDefaultLocationEnabled(values)}
												/>
											</section>
										) : null}

										{activeStep === previewStepIndex ? (
											<section>
												<StepHeading
													title={wizardSteps[4].title}
													description={wizardSteps[4].description}
												/>
												<div className="row g-3 mb-3">
													<div className="col-md-4">
														<div className="card h-100">
															<div className="card-body">
																<div className="text-secondary small">server_name</div>
																<div className="fw-semibold text-break">
																	{values.domainNames?.join(", ") || "—"}
																</div>
															</div>
														</div>
													</div>
													<div className="col-md-4">
														<div className="card h-100">
															<div className="card-body">
																<div className="text-secondary small">proxy_pass</div>
																<div className="fw-semibold text-break">
																	{isDefaultLocationEnabled(values) ? (
																		<>
																			{values.forwardScheme}://
																			{values.forwardHost}:{values.forwardPort}
																		</>
																	) : (
																		<T id="proxy-host.wizard.default-location.disabled" />
																	)}
																</div>
															</div>
														</div>
													</div>
													<div className="col-md-4">
														<div className="card h-100">
															<div className="card-body">
																<div className="text-secondary small">
																	<T id="proxy-host.wizard.summary" />
																</div>
																<div className="fw-semibold">
																	<T
																		id="proxy-host.wizard.summary-value"
																		data={{
																			locations: values.locations?.length || 0,
																		}}
																		tData={{
																			tls: values.certificateId
																				? "proxy-host.wizard.tls-enabled"
																				: "proxy-host.wizard.tls-disabled",
																		}}
																	/>
																</div>
															</div>
														</div>
													</div>
												</div>

												{isPreviewing ? (
													<div className="card">
														<div className="card-body text-center py-5">
															<Loading noLogo />
															<div className="text-secondary mt-2">
																<T id="nginx-options.rendering" />
															</div>
														</div>
													</div>
												) : null}

												{!isPreviewing && previewResult ? (
													<>
														<Alert
															variant={
																previewResult.valid
																	? previewResult.diagnostics.length
																		? "warning"
																		: "success"
																	: "danger"
															}
														>
															<strong>
																<T
																	id={
																		previewResult.valid
																			? "proxy-host.wizard.preview.valid"
																			: "proxy-host.wizard.preview.invalid"
																	}
																/>
															</strong>
															<div className="small mt-1">
																<T id="proxy-host.wizard.validation-scope" />:{" "}
																<code>
																	{previewResult.validationScope || "not_applicable"}
																</code>
															</div>
														</Alert>
														{previewResult.diagnostics.length > 0 ? (
															<Alert
																variant={
																	previewResult.diagnostics.some(
																		(diagnostic) => diagnostic.severity === "error",
																	)
																		? "danger"
																		: "warning"
																}
															>
																<ul className="mb-0 ps-3">
																	{previewResult.diagnostics.map(
																		(diagnostic, index) => (
																			<li
																				key={`${diagnostic.code}-${diagnostic.line || index}`}
																			>
																				<code>{diagnostic.code}</code>:{" "}
																				{diagnostic.message}
																				{diagnostic.line
																					? ` (line ${diagnostic.line})`
																					: ""}
																			</li>
																		),
																	)}
																</ul>
															</Alert>
														) : null}
														<div className="d-flex justify-content-between align-items-center mb-2">
															<h4 className="mb-0">
																<T id="proxy-host.wizard.rendered-config" />
															</h4>
															<code className="small text-secondary">
																{previewResult.hash}
															</code>
														</div>
														<pre
															className="p-3 border rounded bg-dark text-light small overflow-auto mb-0"
															style={{ maxHeight: 420 }}
														>
															{previewResult.config}
														</pre>
													</>
												) : null}
											</section>
										) : null}
									</div>
								</Modal.Body>
								<Modal.Footer className="flex-shrink-0">
									<Button onClick={remove} disabled={isSubmitting || isPreviewing}>
										<T id="cancel" />
									</Button>
									{activeStep > 0 ? (
										<Button onClick={goBack} disabled={isSubmitting || isPreviewing}>
											<T id="proxy-host.wizard.previous" />
										</Button>
									) : null}
									<div className="ms-auto d-flex gap-2">
										{activeStep < previewStepIndex ? (
											<Button
												actionType="primary"
												className="bg-lime"
												onClick={goNext}
												disabled={isSubmitting || isPreviewing}
											>
												<T id="proxy-host.wizard.next" />
											</Button>
										) : (
											<>
												<Button
													onClick={() => runPreview(values)}
													isLoading={isPreviewing}
													disabled={isSubmitting}
												>
													<T id="proxy-host.wizard.preview-again" />
												</Button>
												<HasPermission section={PROXY_HOSTS} permission={MANAGE} hideError>
													<Button
														type="submit"
														actionType="primary"
														className="bg-lime"
														isLoading={isSubmitting}
														disabled={isSubmitting || isPreviewing || !previewResult?.valid}
													>
														<T id="proxy-host.wizard.save-deploy" />
													</Button>
												</HasPermission>
											</>
										)}
									</div>
								</Modal.Footer>
							</Form>
						);
					}}
				</Formik>
			)}
		</Modal>
	);
});

export { showProxyHostModal };
