import { IconSettings } from "@tabler/icons-react";
import cn from "classnames";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, useFormikContext } from "formik";
import { type KeyboardEvent, type MouseEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import type { HostMeta, ProxyHost } from "src/api/backend";
import {
	AccessField,
	Button,
	cleanLocations,
	DomainNamesField,
	ForwardHostCheckHint,
	HasPermission,
	HostConfigTestResult,
	keepSavedAdvancedConfig,
	Loading,
	LocationsFields,
	NginxConfigField,
	NginxErrorMessage,
	SaveWarning,
	SSLCertificateField,
	SSLOptionsFields,
	TestConfigButton,
	UpstreamField,
	usePrefillGuard,
} from "src/components";
import { FormModal } from "src/components/Form";
import { useHostConfigTest, useProxyHost, useSetProxyHost, useUser } from "src/hooks";
import { intl, T } from "src/locale";
import {
	formatApiError,
	getErrorLocationIndex,
	getNginxErrorDetails,
	getProblemLocations,
	getTestLocationIndex,
	hasSaveWarnings,
	stripServerMeta,
} from "src/modules/HostStatus";
import { MANAGE, PROXY_HOSTS } from "src/modules/Permissions";
import { validateForwardHost, validateNumber } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";

type TabId = "details" | "locations" | "ssl" | "advanced";

// In the order of the tab strip, for the arrow keys
const TAB_ORDER: TabId[] = ["details", "locations", "ssl", "advanced"];

// Fields on the Details tab, to show it when one of them is invalid
const DETAILS_FIELDS = ["domainNames", "forwardScheme", "forwardHost", "forwardPort", "accessListId"];

// The tab holding the first invalid field
const tabForErrors = (errors: Record<string, unknown> | undefined): TabId | null => {
	const keys = Object.keys(errors || {});
	if (keys.some((k) => DETAILS_FIELDS.includes(k))) {
		return "details";
	}
	if (keys.includes("locations")) {
		return "locations";
	}
	return null;
};

// Switches to the tab holding the first invalid field after a submit was
// blocked by validation, which would otherwise look like nothing happened.
function TabErrorSwitcher({ onTab }: { onTab: (tab: TabId) => void }) {
	const { isSubmitting, errors } = useFormikContext<any>();
	const wasSubmitting = useRef(false);
	useEffect(() => {
		if (wasSubmitting.current && !isSubmitting) {
			const tab = tabForErrors(errors);
			if (tab) {
				onTab(tab);
			}
		}
		wasSubmitting.current = isSubmitting;
	}, [isSubmitting, errors, onTab]);
	return null;
}

// Values a new proxy host starts with (e.g. from Docker labels); the user still reviews and saves
type ProxyHostPrefill = Partial<
	Pick<
		ProxyHost,
		| "domainNames"
		| "forwardScheme"
		| "forwardHost"
		| "forwardPort"
		| "allowWebsocketUpgrade"
		| "blockExploits"
		| "cachingEnabled"
		| "http2Support"
	>
>;

const showProxyHostModal = (id: number | "new", prefill?: ProxyHostPrefill) => {
	// `id` doubles as the modal id (InnerModalProps): passed as a variable, an object literal would fail the
	// excess property check
	const props = { id, prefill: id === "new" ? prefill : undefined };
	EasyModal.show(ProxyHostModal, props);
};

interface Props extends InnerModalProps {
	id: number | "new";
	prefill?: ProxyHostPrefill;
}
const ProxyHostModal = EasyModal.create(({ id, prefill, visible, remove }: Props) => {
	const { data: currentUser, isLoading: userIsLoading, error: userError } = useUser("me");
	const { data, isLoading, error } = useProxyHost(id);
	const { mutate: setProxyHost } = useSetProxyHost();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [activeTab, setActiveTab] = useState<TabId>("details");
	// Set when a save went through but nginx didn't take all of it
	const [savedMeta, setSavedMeta] = useState<HostMeta | null>(null);
	// Id of a host created by this modal, so that saving again updates it
	const [savedId, setSavedId] = useState<number | null>(null);
	const [highlightIndex, setHighlightIndex] = useState<number | null>(null);
	const guardPrefill = usePrefillGuard();
	const configTest = useHostConfigTest("proxy-hosts");

	const isAdmin = currentUser?.roles?.includes("admin");
	// Only admins may change the advanced config, the others don't get its tab
	const tabOrder = isAdmin ? TAB_ORDER : TAB_ORDER.filter((tab) => tab !== "advanced");

	const showTab = useCallback((tab: TabId) => setActiveTab(tab), []);
	const tabRefs = useRef<Partial<Record<TabId, HTMLAnchorElement | null>>>({});
	// Tabs pattern with a roving tabindex: only the active tab is in the tab order, the arrow keys (and Home /
	// End) move between the tabs and take the focus along, like Bootstrap's tab component did
	const onTabKeyDown = (e: KeyboardEvent<HTMLAnchorElement>, tab: TabId) => {
		const i = tabOrder.indexOf(tab);
		let next: TabId;
		switch (e.key) {
			case "ArrowRight":
			case "ArrowDown":
				next = tabOrder[(i + 1) % tabOrder.length];
				break;
			case "ArrowLeft":
			case "ArrowUp":
				next = tabOrder[(i + tabOrder.length - 1) % tabOrder.length];
				break;
			case "Home":
				next = tabOrder[0];
				break;
			case "End":
				next = tabOrder[tabOrder.length - 1];
				break;
			default:
				return;
		}
		e.preventDefault();
		setActiveTab(next);
		tabRefs.current[next]?.focus();
	};
	const tabLink = (tab: TabId) => ({
		href: `#tab-${tab}`,
		id: `tab-link-${tab}`,
		className: cn("nav-link", { active: activeTab === tab }),
		role: "tab",
		"aria-selected": activeTab === tab,
		"aria-controls": `tab-${tab}`,
		tabIndex: activeTab === tab ? undefined : -1,
		ref: (el: HTMLAnchorElement | null) => {
			tabRefs.current[tab] = el;
		},
		onClick: (e: MouseEvent) => {
			e.preventDefault();
			setActiveTab(tab);
		},
		onKeyDown: (e: KeyboardEvent<HTMLAnchorElement>) => onTabKeyDown(e, tab),
	});
	const tabPane = (tab: TabId) => cn("tab-pane", { "active show": activeTab === tab });

	// What a save sends, also what "Test" checks
	const buildPayload = (values: any) => {
		const payload = {
			id: savedId ?? (id === "new" ? undefined : id),
			...values,
			// rows that were added but never filled in
			locations: cleanLocations(values.locations),
			// server-owned status keys are never sent back
			meta: stripServerMeta(values.meta),
		};
		if (!isAdmin) {
			delete payload.advanced_config;
			delete payload.advancedConfig;
			// as the backend matches them: by path
			payload.locations = keepSavedAdvancedConfig(payload.locations, data?.locations);
		}
		return payload;
	};

	const onTest = async (form: any) => {
		setErrorMsg(null);
		setHighlightIndex(null);
		const result = await configTest.runTest(form, buildPayload(form.values), (errors) => {
			const tab = tabForErrors(errors);
			if (tab) {
				setActiveTab(tab);
			}
		});
		const index = getTestLocationIndex(result);
		if (index !== null) {
			setActiveTab("locations");
			setHighlightIndex(index);
		}
	};

	const onSubmit = async (values: any, { setSubmitting, resetForm }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);
		setSavedMeta(null);
		setHighlightIndex(null);
		configTest.reset();

		const payload = buildPayload(values);

		setProxyHost(payload, {
			onError: (err: unknown) => {
				const details = getNginxErrorDetails(err);
				if (!details) {
					setErrorMsg(formatApiError(err));
					return;
				}
				setErrorMsg(<NginxErrorMessage message={formatApiError(err)} details={details} />);
				const index = getErrorLocationIndex(details);
				if (index !== null || details.scope === "location") {
					setActiveTab("locations");
					setHighlightIndex(index);
				}
			},
			onSuccess: (result: ProxyHost) => {
				if (result && hasSaveWarnings(result.meta)) {
					// Keep the modal open so the problems can be seen (and fixed)
					setSavedId(result.id || null);
					// A requested certificate ("new") now exists: saving again must not request another one.
					// The saved values become the new baseline, so closing now doesn't ask about unsaved changes.
					resetForm({ values: { ...values, certificateId: result.certificateId || 0 } });
					setSavedMeta(result.meta);
					if (getProblemLocations(result.meta).length) {
						setActiveTab("locations");
					}
					return;
				}
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
							domainNames: prefill?.domainNames || data?.domainNames || [],
							forwardScheme: prefill?.forwardScheme || data?.forwardScheme || "http",
							forwardHost: prefill?.forwardHost || data?.forwardHost || "",
							forwardPort: prefill?.forwardPort || data?.forwardPort || undefined,
							accessListId: data?.accessListId || 0,
							cachingEnabled: prefill?.cachingEnabled ?? (data?.cachingEnabled || false),
							blockExploits: prefill?.blockExploits ?? (data?.blockExploits || false),
							allowWebsocketUpgrade:
								prefill?.allowWebsocketUpgrade ?? (data?.allowWebsocketUpgrade || false),
							// Locations tab
							locations: data?.locations || [],
							// SSL tab
							certificateId: data?.certificateId || 0,
							sslForced: data?.sslForced || false,
							// A prefilled (new) host has no certificate yet, and HTTP/2 can't be turned off without one:
							// a npm.http2 label only takes effect once a certificate is picked (http2OnCertificate)
							http2Support: data?.http2Support || false,
							hstsEnabled: data?.hstsEnabled || false,
							hstsSubdomains: data?.hstsSubdomains || false,
							trustForwardedProto: data?.trustForwardedProto || false,
							// Advanced tab
							advancedConfig: data?.advancedConfig || "",
							meta: data?.meta || {},
						} as any
					}
					onSubmit={onSubmit}
				>
					{({ onHide, ...form }) => (
						<Form>
							<TabErrorSwitcher onTab={showTab} />
							<Modal.Header closeButton>
								<Modal.Title>
									<T
										id={data?.id || savedId ? "object.edit" : "object.add"}
										tData={{ object: "proxy-host" }}
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
										<div className="nav nav-tabs card-header-tabs" role="tablist">
											<div className="nav-item" role="presentation">
												<a {...tabLink("details")}>
													<T id="column.details" />
												</a>
											</div>
											<div className="nav-item" role="presentation">
												<a {...tabLink("locations")}>
													<T id="column.custom-locations" />
												</a>
											</div>
											<div className="nav-item" role="presentation">
												<a {...tabLink("ssl")}>
													<T id="column.ssl" />
												</a>
											</div>
											{isAdmin && (
												<div className="nav-item ms-auto" role="presentation">
													<a
														{...tabLink("advanced")}
														title={intl.formatMessage({ id: "location.advanced" })}
													>
														<IconSettings size={20} />
													</a>
												</div>
											)}
										</div>
									</div>
									<div className="card-body">
										<div className="tab-content">
											<div className={tabPane("details")} id="tab-details" role="tabpanel" aria-labelledby="tab-link-details">
												<DomainNamesField isWildcardPermitted dnsProviderWildcardSupported />
												<div className="row">
													<div className="col-sm-3 col-md-3">
														<Field name="forwardScheme">
															{({ field, form }: any) => (
																<div className="mb-3">
																	<label
																		className="form-label text-nowrap"
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
													<div className="col-sm-5 col-md-5">
														<Field name="forwardHost" validate={validateForwardHost}>
															{({ field, form }: any) => (
																<div className="mb-3">
																	<label
																		className="form-label text-nowrap"
																		htmlFor="forwardHost"
																	>
																		<T id="proxy-host.forward-host" />
																	</label>
																	<UpstreamField
																		id="forwardHost"
																		value={field.value || ""}
																		placeholder="example.com"
																		isInvalid={
																			!!(
																				form.errors.forwardHost &&
																				form.touched.forwardHost
																			)
																		}
																		onChange={(v) =>
																			form.setFieldValue("forwardHost", v)
																		}
																		onBlur={() =>
																			form.setFieldTouched("forwardHost", true)
																		}
																		onSelectCandidate={(picked) => {
																			const prefill = guardPrefill(
																				picked,
																				{
																					port: form.values.forwardPort,
																					scheme: form.values.forwardScheme,
																				},
																				{
																					port: form.initialValues
																						.forwardPort,
																					scheme: form.initialValues
																						.forwardScheme,
																				},
																			);
																			if (prefill.port) {
																				form.setFieldValue(
																					"forwardPort",
																					prefill.port,
																				);
																			}
																			if (prefill.scheme) {
																				form.setFieldValue(
																					"forwardScheme",
																					prefill.scheme,
																				);
																			}
																		}}
																	/>
																	{form.errors.forwardHost ? (
																		<div className="invalid-feedback">
																			{form.errors.forwardHost &&
																			form.touched.forwardHost
																				? form.errors.forwardHost
																				: null}
																		</div>
																	) : null}
																	<ForwardHostCheckHint />
																</div>
															)}
														</Field>
													</div>
													<div className="col-sm-4 col-md-4">
														<Field name="forwardPort" validate={validateNumber(1, 65535)}>
															{({ field, form }: any) => (
																<div className="mb-3">
																	<label
																		className="form-label text-nowrap"
																		htmlFor="forwardPort"
																	>
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
											</div>
											<div className={tabPane("locations")} id="tab-locations" role="tabpanel" aria-labelledby="tab-link-locations">
												<LocationsFields
													initialValues={data?.locations || []}
													statuses={
														configTest.result?.nginxLocations ??
														(savedMeta ?? data?.meta)?.nginxLocations
													}
													highlightIndex={highlightIndex}
													allowAdvanced={!!isAdmin}
													readOnly={isSubmitting}
												/>
											</div>
											<div className={tabPane("ssl")} id="tab-ssl" role="tabpanel" aria-labelledby="tab-link-ssl">
												<SSLCertificateField
													name="certificateId"
													label="ssl-certificate"
													allowNew
													http2OnCertificate={!!prefill?.http2Support}
												/>
												<SSLOptionsFields color="bg-lime" forProxyHost={true} />
											</div>
											{isAdmin && (
												<div
													className={tabPane("advanced")}
													id="tab-advanced"
													role="tabpanel"
													aria-labelledby="tab-link-advanced"
												>
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
								<HasPermission section={PROXY_HOSTS} permission={MANAGE} hideError>
									<TestConfigButton
										onClick={() => onTest(form)}
										isTesting={configTest.isTesting}
										disabled={isSubmitting}
									/>
									<Button
										type="submit"
										actionType="primary"
										className="bg-lime"
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
				</FormModal>
			)}
		</>
	);
});

export { type ProxyHostPrefill, showProxyHostModal };
