import { IconSettings } from "@tabler/icons-react";
import cn from "classnames";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { type ChangeEvent, type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import {
	AccessField,
	Button,
	DomainNamesField,
	HasPermission,
	Loading,
	LoadBalancingFields,
	LocationsFields,
	NginxConfigField,
	SSLCertificateField,
	SSLOptionsFields,
} from "src/components";
import { useProxyHost, useSetProxyHost, useUser } from "src/hooks";
import { intl, T } from "src/locale";
import { MANAGE, PROXY_HOSTS } from "src/modules/Permissions";
import { validateNumber, validateString } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";

const showProxyHostModal = (id: number | "new") => {
	EasyModal.show(ProxyHostModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "new";
}
const ProxyHostModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const { data: currentUser, isLoading: userIsLoading, error: userError } = useUser("me");
	const { data, isLoading, error } = useProxyHost(id);
	const { mutate: setProxyHost } = useSetProxyHost();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		const payload = {
			id: id === "new" ? undefined : id,
			...values,
		};

		if (payload.loadBalancingEnabled) {
			const primary = payload.loadBalancingServers?.[0];
			if (primary?.host) {
				payload.forwardHost = primary.host;
			} else if (!payload.forwardHost) {
				payload.forwardHost = "127.0.0.1";
			}

			if (Number.isFinite(primary?.port)) {
				payload.forwardPort = primary.port;
			} else if (!payload.forwardPort || payload.forwardPort < 1) {
				payload.forwardPort = 80;
			}
		}

		setProxyHost(payload, {
			onError: (err: any) => setErrorMsg(<T id={err.message} />),
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
							allowWebsocketUpgrade: data?.allowWebsocketUpgrade || false,
							// Locations tab
							locations: data?.locations || [],
							// SSL tab
							certificateId: data?.certificateId || 0,
							sslForced: data?.sslForced || false,
							http2Support: data?.http2Support || false,
							rateLimitEnabled: data?.rateLimitEnabled || false,
							rateLimit: data?.rateLimit || 0,
							rateLimitBurst: data?.rateLimitBurst || 0,
							rateLimitPeriod: data?.rateLimitPeriod || "minute",
							rateLimitDelay: data?.rateLimitDelay || false,
							loadBalancingEnabled: data?.loadBalancingEnabled || false,
							loadBalancingMethod: data?.loadBalancingMethod || "round_robin",
							loadBalancingServers: data?.loadBalancingServers || [],
							hstsEnabled: data?.hstsEnabled || false,
							hstsSubdomains: data?.hstsSubdomains || false,
							// Advanced tab
							advancedConfig: data?.advancedConfig || "",
							meta: data?.meta || {},
						} as any
					}
					onSubmit={onSubmit}
				>
					{({ values, setFieldValue }) => {
						const rateLimitEnabled = !!values.rateLimitEnabled;
						const loadBalancingEnabled = !!values.loadBalancingEnabled;
						const validateRateLimit = (value: string) => {
							if (!rateLimitEnabled) {
								return;
							}
							return validateNumber(1)(value);
						};

						const handleRateLimitToggle = (event: ChangeEvent<HTMLInputElement>) => {
							const enabled = event.target.checked;
							setFieldValue("rateLimitEnabled", enabled);

							if (enabled) {
								if (!values.rateLimit || values.rateLimit < 1) {
									setFieldValue("rateLimit", 60);
								}
								if (typeof values.rateLimitBurst === "undefined" || values.rateLimitBurst < 0) {
									setFieldValue("rateLimitBurst", 0);
								}
								if (!values.rateLimitPeriod) {
									setFieldValue("rateLimitPeriod", "minute");
								}
								if (typeof values.rateLimitDelay === "undefined") {
									setFieldValue("rateLimitDelay", false);
								}
							}
						};

						const handleLoadBalancingToggle = (event: ChangeEvent<HTMLInputElement>) => {
							const enabled = event.target.checked;
							setFieldValue("loadBalancingEnabled", enabled);

							if (enabled) {
								if (!values.loadBalancingMethod) {
									setFieldValue("loadBalancingMethod", "round_robin");
								}
								if (!values.loadBalancingServers) {
									setFieldValue("loadBalancingServers", []);
								}
								if (!values.forwardScheme) {
									setFieldValue("forwardScheme", "http");
								}
								if (!values.forwardPort || values.forwardPort < 1) {
									setFieldValue("forwardPort", 80);
								}
							}
						};

						const forwardFields = (
							<div className="row">
								<div className="col-md-3">
									<Field name="forwardScheme">
										{({ field, form }: any) => (
											<div className="mb-3">
												<label className="form-label" htmlFor="forwardScheme">
													<T id="host.forward-scheme" />
												</label>
												<select
													id="forwardScheme"
													className={`form-control ${form.errors.forwardScheme && form.touched.forwardScheme ? "is-invalid" : ""}`}
													required
													{...field}
												>
													<option value="http">http</option>
													<option value="https">https</option>
												</select>
												{form.errors.forwardScheme ? (
													<div className="invalid-feedback">
														{form.errors.forwardScheme && form.touched.forwardScheme
															? form.errors.forwardScheme
															: null}
													</div>
												) : null}
											</div>
										)}
									</Field>
								</div>
								<div className="col-md-6">
									<Field name="forwardHost" validate={validateString(1, 255)}>
										{({ field, form }: any) => (
											<div className="mb-3">
												<label className="form-label" htmlFor="forwardHost">
													<T id="proxy-host.forward-host" />
												</label>
												<input
													id="forwardHost"
													type="text"
													className={`form-control ${form.errors.forwardHost && form.touched.forwardHost ? "is-invalid" : ""}`}
													required
													placeholder="example.com"
													{...field}
												/>
												{form.errors.forwardHost ? (
													<div className="invalid-feedback">
														{form.errors.forwardHost && form.touched.forwardHost
															? form.errors.forwardHost
															: null}
													</div>
												) : null}
											</div>
										)}
									</Field>
								</div>
								<div className="col-md-3">
									<Field name="forwardPort" validate={validateNumber(1, 65535)}>
										{({ field, form }: any) => (
											<div className="mb-3">
												<label className="form-label" htmlFor="forwardPort">
													<T id="host.forward-port" />
												</label>
												<input
													id="forwardPort"
													type="number"
													min={1}
													max={65535}
													className={`form-control ${form.errors.forwardPort && form.touched.forwardPort ? "is-invalid" : ""}`}
													required
													placeholder="eg: 8081"
													{...field}
												/>
												{form.errors.forwardPort ? (
													<div className="invalid-feedback">
														{form.errors.forwardPort && form.touched.forwardPort
															? form.errors.forwardPort
															: null}
													</div>
												) : null}
											</div>
										)}
									</Field>
								</div>
							</div>
						);

						const upstreamFields = (
							<div className="row">
								<div className="col-md-3">
									<Field name="forwardScheme">
										{({ field, form }: any) => (
											<div className="mb-3">
												<label className="form-label" htmlFor="forwardScheme">
													<T id="host.forward-scheme" />
												</label>
												<select
													id="forwardScheme"
													className={`form-control ${form.errors.forwardScheme && form.touched.forwardScheme ? "is-invalid" : ""}`}
													required
													{...field}
												>
													<option value="http">http</option>
													<option value="https">https</option>
												</select>
												{form.errors.forwardScheme ? (
													<div className="invalid-feedback">
														{form.errors.forwardScheme && form.touched.forwardScheme
															? form.errors.forwardScheme
															: null}
													</div>
												) : null}
											</div>
										)}
									</Field>
								</div>
								<div className="col-md-6">
									<div className="mb-3">
										<label className="form-label" htmlFor="upstreamName">
											<T id="load-balancing.upstream" />
										</label>
										<input
											id="upstreamName"
											type="text"
											className="form-control"
											value={data?.id ? `proxy_host_${data.id}_upstream` : ""}
											placeholder={data?.id ? undefined : intl.formatMessage({ id: "auto" })}
											readOnly
										/>
									</div>
								</div>
							</div>
						);

						return (
							<Form>
							<Modal.Header closeButton>
								<Modal.Title>
									<T id={data?.id ? "object.edit" : "object.add"} tData={{ object: "proxy-host" }} />
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
												<div className="mt-4">
													<h4 className="py-2">
														<T id="load-balancing" />
													</h4>
													<div className="divide-y">
														<div>
															<label className="row" htmlFor="loadBalancingEnabled">
																<span className="col">
																	<T id="load-balancing.enable" />
																</span>
																<span className="col-auto">
																	<Field name="loadBalancingEnabled" type="checkbox">
																		{({ field }: any) => (
																			<label className="form-check form-check-single form-switch">
																				<input
																					{...field}
																					id="loadBalancingEnabled"
																					className={cn("form-check-input", {
																						"bg-lime": field.checked,
																					})}
																					type="checkbox"
																					checked={!!field.checked}
																					onChange={handleLoadBalancingToggle}
																				/>
																			</label>
																		)}
																	</Field>
																</span>
															</label>
														</div>
													</div>
													{loadBalancingEnabled ? (
														<>
															<div className="row mt-3">
																<div className="col-md-6">
																	<Field name="loadBalancingMethod">
																		{({ field }: any) => (
																			<div className="mb-3">
																				<label
																					className="form-label"
																					htmlFor="loadBalancingMethod"
																				>
																					<T id="load-balancing.method" />
																				</label>
																				<select
																					id="loadBalancingMethod"
																					className="form-control"
																					{...field}
																				>
																					<option value="round_robin">
																						<T id="load-balancing.method.round-robin" />
																					</option>
																					<option value="least_conn">
																						<T id="load-balancing.method.least-conn" />
																					</option>
																					<option value="ip_hash">
																						<T id="load-balancing.method.ip-hash" />
																					</option>
																				</select>
																			</div>
																		)}
																	</Field>
																</div>
															</div>
															{upstreamFields}
															<p className="text-muted mb-2">
																<T id="load-balancing.help" />
															</p>
															<h5 className="mt-3 mb-2">
																<T id="load-balancing.servers" />
															</h5>
															<LoadBalancingFields initialValues={values.loadBalancingServers} />
														</>
													) : (
														<div className="mt-3">{forwardFields}</div>
													)}
												</div>
												<AccessField />
												<div className="my-3">
													<h4 className="py-2">
														<T id="options" />
													</h4>
													<div className="divide-y">
														<div>
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
													</div>
												</div>
												<div className="mt-4">
													<h4 className="py-2">
														<T id="rate-limit" />
													</h4>
													<div className="divide-y">
														<div>
															<label className="row" htmlFor="rateLimitEnabled">
																<span className="col">
																	<T id="rate-limit.enable" />
																</span>
																<span className="col-auto">
																	<Field name="rateLimitEnabled" type="checkbox">
																		{({ field }: any) => (
																			<label className="form-check form-check-single form-switch">
																				<input
																					{...field}
																					id="rateLimitEnabled"
																					className={cn("form-check-input", {
																						"bg-lime": field.checked,
																					})}
																					type="checkbox"
																					checked={!!field.checked}
																					onChange={handleRateLimitToggle}
																				/>
																			</label>
																		)}
																	</Field>
																</span>
															</label>
														</div>
													</div>
													{rateLimitEnabled ? (
														<>
															<div className="row mt-3">
																<div className="col-md-6">
																	<Field name="rateLimit" validate={validateRateLimit}>
																		{({ field, form }: any) => (
																			<div className="mb-3">
																				<label
																					className="form-label"
																					htmlFor="rateLimit"
																				>
																					<T id="rate-limit.requests-per-minute" />
																				</label>
																				<div className="input-group">
																					<input
																						id="rateLimit"
																						type="number"
																						min={1}
																						className={`form-control ${form.errors.rateLimit && form.touched.rateLimit ? "is-invalid" : ""}`}
																						placeholder="60"
																						{...field}
																					/>
																					<Field name="rateLimitPeriod">
																						{({ field: periodField }: any) => (
																							<select
																								className="form-select"
																								{...periodField}
																							>
																								<option value="minute">
																									<T id="rate-limit.period.minute" />
																								</option>
																								<option value="second">
																									<T id="rate-limit.period.second" />
																								</option>
																							</select>
																						)}
																					</Field>
																				</div>
																				{form.errors.rateLimit ? (
																					<div className="invalid-feedback">
																						{form.errors.rateLimit &&
																						form.touched.rateLimit
																							? form.errors.rateLimit
																							: null}
																					</div>
																				) : null}
																			</div>
																		)}
																	</Field>
																</div>
																<div className="col-md-6">
																	<Field name="rateLimitBurst">
																		{({ field }: any) => (
																			<div className="mb-3">
																				<label
																					className="form-label"
																					htmlFor="rateLimitBurst"
																				>
																					<T id="rate-limit.burst" />
																				</label>
																				<input
																					id="rateLimitBurst"
																					type="number"
																					min={0}
																					className="form-control"
																					placeholder="0"
																					{...field}
																				/>
																			</div>
																		)}
																	</Field>
																</div>
															</div>
															<div className="divide-y">
																<div>
																	<label className="row" htmlFor="rateLimitDelay">
																		<span className="col">
																			<T id="rate-limit.delay" />
																		</span>
																		<span className="col-auto">
																			<Field name="rateLimitDelay" type="checkbox">
																				{({ field }: any) => (
																					<label className="form-check form-check-single form-switch">
																						<input
																							{...field}
																							id="rateLimitDelay"
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
															</div>
															<p className="text-muted mb-0">
																<T id="rate-limit.help" />
															</p>
														</>
													) : null}
												</div>
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
												<SSLOptionsFields color="bg-lime" />
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
						);
					}}
				</Formik>
			)}
		</Modal>
	);
});

export { showProxyHostModal };
