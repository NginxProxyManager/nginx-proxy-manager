import { IconShield, IconTrash } from "@tabler/icons-react";
import cn from "classnames";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik, useFormikContext } from "formik";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import Select, { type ActionMeta, components, type MultiValue, type OptionProps, type SingleValue } from "react-select";
import type { AccessList, AccessListClient, AccessListClientCA, AccessListItem, Certificate } from "src/api/backend";
import { AccessClientFields, BasicAuthFields, Button, Loading } from "src/components";
import { useLocaleState } from "src/context";
import { useAccessList, useCertificates, useSetAccessList } from "src/hooks";
import { formatDateTime, intl, T } from "src/locale";
import { validateString } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";

const showAccessListModal = (id: number | "new") => {
	EasyModal.show(AccessListModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "new";
}

interface ClientCAOption {
	readonly value: number;
	readonly label: string;
	readonly subLabel: string;
	readonly certificate: Certificate;
	readonly icon: React.ReactNode;
}

const ClientCAOption = (props: OptionProps<ClientCAOption>) => (
	<components.Option {...props}>
		<div className="flex-fill">
			<div className="font-weight-medium">
				{props.data.icon} <strong>{props.data.label}</strong>
			</div>
			<div className="text-secondary mt-1 ps-3">{props.data.subLabel}</div>
		</div>
	</components.Option>
);

const getClientCAId = (value: AccessListClientCA | number | string) =>
	typeof value === "object" ? value.certificateId : Number(value);

const ClientCAFields = ({ certificates = [] }: { certificates?: Certificate[] }) => {
	const { locale } = useLocaleState();
	const { setFieldValue } = useFormikContext();
	const [selectedOption, setSelectedOption] = useState<ClientCAOption | null>(null);

	return (
		<Field name="clientcas">
			{({ field }: any) => {
				const selectedValues = field.value || [];
				const selectedIds = new Set(selectedValues.map(getClientCAId));
				const clientCACertificates = certificates.filter((cert: Certificate) => cert.provider === "clientca");
				const options: ClientCAOption[] = clientCACertificates
					.filter((cert: Certificate) => !selectedIds.has(cert.id))
					.map((cert: Certificate) => ({
						value: cert.id,
						label: cert.niceName,
						subLabel: intl.formatMessage(
							{ id: "expires.on" },
							{ date: cert.expiresOn ? formatDateTime(cert.expiresOn, locale) : "N/A" },
						),
						certificate: cert,
						icon: <IconShield size={14} className="text-lime" />,
					}));
				const selectedCertificates = selectedValues.map((value: AccessListClientCA | number | string) => {
					const certificateId = getClientCAId(value);
					const expandedCertificate = typeof value === "object" ? value.certificate : undefined;
					return expandedCertificate || certificates.find((cert: Certificate) => cert.id === certificateId);
				});

				const handleAdd = () => {
					if (!selectedOption) {
						return;
					}
					setFieldValue(field.name, [...selectedValues, selectedOption.value]);
					setSelectedOption(null);
				};

				const handleRemove = (certificateId: number) => {
					setFieldValue(
						field.name,
						selectedValues.filter((value: AccessListClientCA | number | string) => getClientCAId(value) !== certificateId),
					);
				};

				return (
					<div className="mb-3">
						<label className="form-label" htmlFor="clientcas">
							<T id="access-list.client-cas" />
						</label>
						<div className="row g-2 align-items-start">
							<div className="col">
								<Select
									className="react-select-container"
									classNamePrefix="react-select"
									inputId="clientcas"
									placeholder={intl.formatMessage({ id: "access-list.client-ca-search-placeholder" })}
									value={selectedOption}
									options={options}
									components={{ Option: ClientCAOption }}
									styles={{
										option: (base) => ({
											...base,
											height: "100%",
										}),
									}}
									onChange={(
										newValue: SingleValue<ClientCAOption> | MultiValue<ClientCAOption>,
										_actionMeta: ActionMeta<ClientCAOption>,
									) => setSelectedOption((Array.isArray(newValue) ? null : newValue) as ClientCAOption | null)}
								/>
							</div>
							<div className="col-auto">
								<Button
									type="button"
									actionType="primary"
									className="bg-cyan"
									disabled={!selectedOption}
									onClick={handleAdd}
								>
									<T id="action.add" />
								</Button>
							</div>
						</div>
						<div className="mt-3">
							<h4 className="mb-2">
								<T id="access-list.authorized-client-cas" />
							</h4>
							{selectedCertificates.length ? (
								<div className="list-group list-group-flush">
									{selectedCertificates.map((cert: Certificate | undefined, idx: number) => {
										const certificateId = cert?.id || getClientCAId(selectedValues[idx]);
										return (
											<div
												className="list-group-item px-0 d-flex align-items-center justify-content-between"
												key={certificateId}
											>
												<div className="d-flex align-items-center">
													<IconShield size={18} className="text-lime me-3" />
													<div>
														<div className="font-weight-medium">
															{cert?.niceName || intl.formatMessage({ id: "certificate.not-in-use" })}
														</div>
														<div className="text-secondary">
															{cert?.expiresOn
																? intl.formatMessage(
																		{ id: "expires.on" },
																		{ date: formatDateTime(cert.expiresOn, locale) },
																	)
																: null}
														</div>
													</div>
												</div>
												<Button
													type="button"
													actionType="danger"
													className="btn-icon"
													onClick={() => handleRemove(certificateId)}
												>
													<IconTrash size={18} />
												</Button>
											</div>
										);
									})}
								</div>
							) : (
								<p className="text-secondary mb-0">
									<T id="access-list.no-client-cas" />
								</p>
							)}
						</div>
					</div>
				);
			}}
		</Field>
	);
};

const AccessListModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const { data, isLoading, error } = useAccessList(id, ["items", "clients", "clientcas.certificate"]);
	const { data: certificates, isLoading: certificatesLoading } = useCertificates();
	const { mutate: setAccessList } = useSetAccessList();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const validate = (values: any): string | null => {
		// either Auths or Clients must be defined
		if (values.items?.length === 0 && values.clients?.length === 0 && values.clientcas?.length === 0) {
			return intl.formatMessage({ id: "error.access.at-least-one" });
		}

		// ensure the items don't contain the same username twice
		const usernames = values.items.map((i: any) => i.username);
		const uniqueUsernames = Array.from(new Set(usernames));
		if (usernames.length !== uniqueUsernames.length) {
			return intl.formatMessage({ id: "error.access.duplicate-usernames" });
		}

		return null;
	};

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;

		const vErr = validate(values);
		if (vErr) {
			setErrorMsg(vErr);
			return;
		}

		setIsSubmitting(true);
		setErrorMsg(null);

		const { ...payload } = {
			id: id === "new" ? undefined : id,
			...values,
		};

		// Filter out "items" to only use the "username" and "password" fields
		payload.items = (values.items || []).map((i: AccessListItem) => ({
			username: i.username,
			password: i.password,
		}));

		// Filter out "clients" to only use the "directive" and "address" fields
		payload.clients = (values.clients || []).map((i: AccessListClient) => ({
			directive: i.directive,
			address: i.address,
		}));
		payload.clientcas = (values.clientcas || []).map((i: AccessListClientCA | number | string) =>
			typeof i === "object" ? i.certificateId : Number(i),
		);

		setAccessList(payload, {
			onError: (err: any) => setErrorMsg(<T id={err.message} />),
			onSuccess: () => {
				showObjectSuccess("access-list", "saved");
				remove();
			},
			onSettled: () => {
				setIsSubmitting(false);
				setSubmitting(false);
			},
		});
	};

	const toggleClasses = "form-check-input";
	const toggleEnabled = cn(toggleClasses, "bg-cyan");

	return (
		<Modal show={visible} onHide={remove}>
			{!isLoading && error && (
				<Alert variant="danger" className="m-3">
					{error?.message || "Unknown error"}
				</Alert>
			)}
			{(isLoading || certificatesLoading) && <Loading noLogo />}
			{!isLoading && !certificatesLoading && data && (
				<Formik
					initialValues={
						{
							name: data?.name,
							satisfyAny: data?.satisfyAny,
							passAuth: data?.passAuth,
							items: data?.items || [],
							clients: data?.clients || [],
							clientcas: data?.clientcas || [],
						} as AccessList
					}
					onSubmit={onSubmit}
				>
					{({ setFieldValue }: any) => (
						<Form>
							<Modal.Header closeButton>
								<Modal.Title>
									<T id={data?.id ? "object.edit" : "object.add"} tData={{ object: "access-list" }} />
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
													href="#tab-auth"
													className="nav-link"
													data-bs-toggle="tab"
													aria-selected="false"
													tabIndex={-1}
													role="tab"
												>
													<T id="column.authorizations" />
												</a>
											</li>
											<li className="nav-item" role="presentation">
												<a
													href="#tab-rules"
													className="nav-link"
													data-bs-toggle="tab"
													aria-selected="false"
													tabIndex={-1}
													role="tab"
												>
													<T id="column.rules" />
												</a>
											</li>
											<li className="nav-item" role="presentation">
												<a
													href="#tab-clientcas"
													className="nav-link"
													data-bs-toggle="tab"
													aria-selected="false"
													tabIndex={-1}
													role="tab"
												>
													<T id="access-list.client-cas" />
												</a>
											</li>
										</ul>
									</div>
									<div className="card-body">
										<div className="tab-content">
											<div className="tab-pane active show" id="tab-details" role="tabpanel">
												<Field name="name" validate={validateString(1, 255)}>
													{({ field, form }: any) => (
														<div>
															<label htmlFor="name" className="form-label">
																<T id="column.name" />
															</label>
															<input
																id="name"
																type="text"
																required
																autoComplete="off"
																className="form-control"
																{...field}
															/>
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
												<div className="my-3">
													<h3 className="py-2">
														<T id="options" />
													</h3>
													<div className="divide-y">
														<div>
															<label className="row" htmlFor="satisfyAny">
																<span className="col">
																	<T id="access-list.satisfy-any" />
																</span>
																<span className="col-auto">
																	<Field name="satisfyAny" type="checkbox">
																		{({ field }: any) => (
																			<label className="form-check form-check-single form-switch">
																				<input
																					id="satisfyAny"
																					className={
																						field.value
																							? toggleEnabled
																							: toggleClasses
																					}
																					type="checkbox"
																					name={field.name}
																					checked={field.value}
																					onChange={(e: any) => {
																						setFieldValue(
																							field.name,
																							e.target.checked,
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
															<label className="row" htmlFor="passAuth">
																<span className="col">
																	<T id="access-list.pass-auth" />
																</span>
																<span className="col-auto">
																	<Field name="passAuth" type="checkbox">
																		{({ field }: any) => (
																			<label className="form-check form-check-single form-switch">
																				<input
																					id="passAuth"
																					className={
																						field.value
																							? toggleEnabled
																							: toggleClasses
																					}
																					type="checkbox"
																					name={field.name}
																					checked={field.value}
																					onChange={(e: any) => {
																						setFieldValue(
																							field.name,
																							e.target.checked,
																						);
																					}}
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
											<div className="tab-pane" id="tab-auth" role="tabpanel">
												<BasicAuthFields initialValues={data?.items || []} />
											</div>
											<div className="tab-pane" id="tab-rules" role="tabpanel">
												<AccessClientFields initialValues={data?.clients || []} />
											</div>
											<div className="tab-pane" id="tab-clientcas" role="tabpanel">
												<ClientCAFields certificates={certificates} />
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
									actionType="primary"
									className="ms-auto bg-cyan"
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

export { showAccessListModal };
