import { IconSettings } from "@tabler/icons-react";
import cn from "classnames";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, useFormikContext } from "formik";
import { type MouseEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import type { HostMeta, ProxyHost } from "src/api/backend";
import {
	AccessField,
	Button,
	cleanLocations,
	DomainNamesField,
	HasPermission,
	Loading,
	LocationsFields,
	NginxConfigField,
	NginxErrorMessage,
	SaveWarning,
	SSLCertificateField,
	SSLOptionsFields,
} from "src/components";
import { FormModal } from "src/components/Form";
import { useProxyHost, useSetProxyHost, useUser } from "src/hooks";
import { intl, T } from "src/locale";
import {
	formatApiError,
	getErrorLocationIndex,
	getNginxErrorDetails,
	getProblemLocations,
	hasSaveWarnings,
	stripServerMeta,
} from "src/modules/HostStatus";
import { MANAGE, PROXY_HOSTS } from "src/modules/Permissions";
import { validateForwardHost, validateNumber } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";

type TabId = "details" | "locations" | "ssl" | "advanced";

// Fields on the Details tab, to show it when one of them is invalid
const DETAILS_FIELDS = ["domainNames", "forwardScheme", "forwardHost", "forwardPort", "accessListId"];

// Switches to the tab holding the first invalid field after a submit was
// blocked by validation, which would otherwise look like nothing happened.
function TabErrorSwitcher({ onTab }: { onTab: (tab: TabId) => void }) {
	const { isSubmitting, errors } = useFormikContext<any>();
	const wasSubmitting = useRef(false);
	useEffect(() => {
		if (wasSubmitting.current && !isSubmitting) {
			const keys = Object.keys(errors || {});
			if (keys.some((k) => DETAILS_FIELDS.includes(k))) {
				onTab("details");
			} else if (keys.includes("locations")) {
				onTab("locations");
			}
		}
		wasSubmitting.current = isSubmitting;
	}, [isSubmitting, errors, onTab]);
	return null;
}

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
	const [activeTab, setActiveTab] = useState<TabId>("details");
	// Set when a save went through but nginx didn't take all of it
	const [savedMeta, setSavedMeta] = useState<HostMeta | null>(null);
	// Id of a host created by this modal, so that saving again updates it
	const [savedId, setSavedId] = useState<number | null>(null);
	const [highlightIndex, setHighlightIndex] = useState<number | null>(null);

	const showTab = useCallback((tab: TabId) => setActiveTab(tab), []);
	const tabLink = (tab: TabId) => ({
		href: `#tab-${tab}`,
		className: cn("nav-link", { active: activeTab === tab }),
		role: "tab",
		"aria-selected": activeTab === tab,
		tabIndex: activeTab === tab ? undefined : -1,
		onClick: (e: MouseEvent) => {
			e.preventDefault();
			setActiveTab(tab);
		},
	});
	const tabPane = (tab: TabId) => cn("tab-pane", { "active show": activeTab === tab });

	const isAdmin = currentUser?.roles?.includes("admin");

	const onSubmit = async (values: any, { setSubmitting, resetForm }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);
		setSavedMeta(null);
		setHighlightIndex(null);

		const { ...payload } = {
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
			// Location advanced configs are sent as-is. Non-admins can't edit them (the editor is
			// hidden), so each one is still the admin-written value and moves with its location
			// when the path is renamed; the backend matches them by value. Looking them up by
			// path here would silently drop the config from a renamed location.
		}

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
					{({ onHide }) => (
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
								<div className="card m-0 border-0">
									<div className="card-header">
										<ul className="nav nav-tabs card-header-tabs">
											<li className="nav-item" role="presentation">
												<a {...tabLink("details")}>
													<T id="column.details" />
												</a>
											</li>
											<li className="nav-item" role="presentation">
												<a {...tabLink("locations")}>
													<T id="column.custom-locations" />
												</a>
											</li>
											<li className="nav-item" role="presentation">
												<a {...tabLink("ssl")}>
													<T id="column.ssl" />
												</a>
											</li>
											{isAdmin && (
												<li className="nav-item ms-auto" role="presentation">
													<a
														{...tabLink("advanced")}
														title={intl.formatMessage({ id: "location.advanced" })}
													>
														<IconSettings size={20} />
													</a>
												</li>
											)}
										</ul>
									</div>
									<div className="card-body">
										<div className="tab-content">
											<div className={tabPane("details")} id="tab-details" role="tabpanel">
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
											<div className={tabPane("locations")} id="tab-locations" role="tabpanel">
												<LocationsFields
													initialValues={data?.locations || []}
													statuses={(savedMeta ?? data?.meta)?.nginxLocations}
													highlightIndex={highlightIndex}
													allowAdvanced={!!isAdmin}
												/>
											</div>
											<div className={tabPane("ssl")} id="tab-ssl" role="tabpanel">
												<SSLCertificateField
													name="certificateId"
													label="ssl-certificate"
													allowNew
												/>
												<SSLOptionsFields color="bg-lime" forProxyHost={true} />
											</div>
											{isAdmin && (
												<div className={tabPane("advanced")} id="tab-advanced" role="tabpanel">
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
				</FormModal>
			)}
		</>
	);
});

export { showProxyHostModal };
