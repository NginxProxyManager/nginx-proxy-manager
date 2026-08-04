import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { useState } from "react";
import { Alert, Modal } from "react-bootstrap";
import type { Upstream, UpstreamServer } from "src/api/backend";
import { Button, Loading } from "src/components";
import { useSetUpstream, useUpstream } from "src/hooks";
import { intl, T } from "src/locale";
import { showError, showObjectSuccess } from "src/notifications";

const defaultServer = (): UpstreamServer => ({
	host: "",
	port: 80,
	weight: 1,
	maxFails: 1,
	failTimeout: "10s",
	backup: false,
	down: false,
});

const defaultValue = (): Partial<Upstream> => ({
	name: "",
	nginxKey: "",
	isDisabled: false,
	loadBalancingMethod: "round_robin",
	zoneSize: "64k",
	servers: [defaultServer()],
});

type UpstreamServerForm = Omit<UpstreamServer, "maxConns"> & {
	maxConns?: number | string | null;
};

interface Props extends InnerModalProps {
	id: number | "new";
}

interface SwitchFieldProps {
	name: string;
	id: string;
	label: string;
	help?: string;
}

function SwitchField({ name, id, label, help }: SwitchFieldProps) {
	return (
		<Field name={name}>
			{({ field, form }: any) => {
				const checked = field.value === true || field.value === 1;
				return (
					<label
						className="d-flex align-items-start justify-content-between gap-3 border rounded p-3 h-100"
						htmlFor={id}
					>
						<span>
							<span className="d-block fw-medium">
								<T id={label} />
							</span>
							{help ? (
								<span className="d-block small text-secondary mt-1">
									<T id={help} />
								</span>
							) : null}
						</span>
						<span className="form-check form-check-single form-switch mt-1">
							<input
								id={id}
								name={field.name}
								type="checkbox"
								className={`form-check-input${checked ? " bg-lime" : ""}`}
								checked={checked}
								onBlur={field.onBlur}
								onChange={(event) => form.setFieldValue(name, event.currentTarget.checked)}
							/>
						</span>
					</label>
				);
			}}
		</Field>
	);
}

const UpstreamModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const { data, isLoading, error } = useUpstream(id);
	const { mutate: setUpstream } = useSetUpstream();
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const isNew = id === "new";

	const initialValues = isNew
		? defaultValue()
		: data
			? {
					...data,
					servers: data.servers.map((server) => ({
						...server,
						maxConns: server.maxConns ?? "",
						backup: server.backup === true,
						down: server.down === true,
					})),
				}
			: defaultValue();
	const submit = (values: any) => {
		setSubmitting(true);
		setErrorMsg(null);
		const payload = {
			...(isNew ? {} : { id: Number(id) }),
			name: values.name?.trim(),
			nginxKey: values.nginxKey?.trim(),
			loadBalancingMethod: values.loadBalancingMethod,
			zoneSize: values.zoneSize?.trim() || undefined,
			isDisabled: values.isDisabled === true,
			servers: values.servers.map((server: any, index: number) => ({
				...(server.id ? { id: Number(server.id) } : {}),
				host: String(server.host || "").trim(),
				port: Number(server.port),
				weight: server.weight === "" || server.weight == null ? 1 : Number(server.weight),
				maxFails: server.maxFails === "" || server.maxFails == null ? 1 : Number(server.maxFails),
				maxConns: server.maxConns === "" ? null : Number(server.maxConns) || null,
				failTimeout: String(server.failTimeout || "10s").trim(),
				backup: server.backup === true,
				down: server.down === true,
				sortOrder: index,
			})),
		};
		setUpstream(payload, {
			onSuccess: () => {
				showObjectSuccess("upstream", "saved");
				remove();
			},
			onError: (err: any) => {
				const message = err?.message || intl.formatMessage({ id: "upstreams.error.save" });
				setErrorMsg(message);
				showError(message);
			},
			onSettled: () => setSubmitting(false),
		});
	};

	return (
		<Modal show={visible} onHide={remove} size="xl" scrollable>
			{isLoading && <Loading noLogo />}
			{!isLoading && (
				<Formik initialValues={initialValues} enableReinitialize onSubmit={submit}>
					{({ values, setFieldValue }) => {
						const servers = (values.servers || []) as UpstreamServerForm[];
						return (
							<Form className="d-flex flex-column h-100 overflow-hidden">
								<Modal.Header closeButton>
									<Modal.Title>
										{isNew ? (
											<T id="upstreams.modal.add" />
										) : (
											<T id="upstreams.modal.edit" data={{ name: data?.name || "" }} />
										)}
									</Modal.Title>
								</Modal.Header>
								<Modal.Body className="bg-body-tertiary">
									{(error || errorMsg) && (
										<Alert variant="danger">{errorMsg || (error as Error)?.message}</Alert>
									)}
									<Alert variant="info">
										<T id="upstreams.passive-health-checks" />
									</Alert>

									<div className="card mb-3">
										<div className="card-header">
											<h3 className="card-title">
												<T id="upstreams.settings" />
											</h3>
										</div>
										<div className="card-body">
											<div className="row g-3">
												<div className="col-md-6">
													<label className="form-label" htmlFor="upstream-name">
														<T id="upstreams.display-name" />
													</label>
													<Field
														id="upstream-name"
														className="form-control"
														name="name"
														required
													/>
												</div>
												<div className="col-md-6">
													<label className="form-label" htmlFor="upstream-nginx-key">
														<T id="upstreams.nginx-key" />
													</label>
													<Field
														id="upstream-nginx-key"
														className="form-control"
														name="nginxKey"
														required
														disabled={!isNew}
														placeholder="app_backend"
													/>
													<div className="form-hint">
														<T id="upstreams.nginx-key.help" />
													</div>
												</div>
												<div className="col-md-6">
													<label className="form-label" htmlFor="upstream-method">
														<T id="upstreams.load-balancing-method" />
													</label>
													<Field
														id="upstream-method"
														as="select"
														className="form-select"
														name="loadBalancingMethod"
													>
														<option value="round_robin">
															{intl.formatMessage({ id: "upstreams.method.round_robin" })}
														</option>
														<option value="least_conn">
															{intl.formatMessage({ id: "upstreams.method.least_conn" })}
														</option>
														<option value="ip_hash">
															{intl.formatMessage({ id: "upstreams.method.ip_hash" })}
														</option>
														<option value="random">
															{intl.formatMessage({ id: "upstreams.method.random" })}
														</option>
													</Field>
												</div>
												<div className="col-md-6">
													<label className="form-label" htmlFor="upstream-zone-size">
														<T id="upstreams.shared-zone-size" />
													</label>
													<Field
														id="upstream-zone-size"
														className="form-control"
														name="zoneSize"
														placeholder="64k"
													/>
												</div>
												<div className="col-12">
													<SwitchField
														id="upstream-disabled"
														name="isDisabled"
														label="disabled"
														help="upstreams.disabled.help"
													/>
												</div>
											</div>
										</div>
									</div>

									<div className="d-flex align-items-center mb-3">
										<div>
											<h3 className="mb-0">
												<T id="upstreams.servers" />
											</h3>
											<div className="small text-secondary">
												<T id="upstreams.servers.help" />
											</div>
										</div>
										<Button
											type="button"
											size="sm"
											color="blue"
											className="ms-auto"
											onClick={() => setFieldValue("servers", [...servers, defaultServer()])}
										>
											<T id="upstreams.server.add" />
										</Button>
									</div>

									{servers.map((server, index) => (
										<div key={index} className="card mb-3">
											<div className="card-header">
												<div>
													<h3 className="card-title">
														<T id="upstreams.server.title" data={{ number: index + 1 }} />
													</h3>
													{server.host ? (
														<div className="small text-secondary mt-1">
															{server.host}:{server.port || 80}
														</div>
													) : null}
												</div>
												<Button
													type="button"
													size="sm"
													className="btn-outline-danger ms-auto"
													disabled={servers.length === 1}
													onClick={() =>
														setFieldValue(
															"servers",
															servers.filter((_, serverIndex) => serverIndex !== index),
														)
													}
												>
													<T id="upstreams.server.remove" />
												</Button>
											</div>
											<div className="card-body">
												<div className="row g-3">
													<div className="col-md-8">
														<label
															className="form-label"
															htmlFor={`upstream-server-${index}-host`}
														>
															<T id="upstreams.server.host" />
														</label>
														<Field
															id={`upstream-server-${index}-host`}
															className="form-control"
															name={`servers.${index}.host`}
															required
															placeholder="10.0.0.20"
														/>
													</div>
													<div className="col-md-4">
														<label
															className="form-label"
															htmlFor={`upstream-server-${index}-port`}
														>
															<T id="upstreams.server.port" />
														</label>
														<Field
															id={`upstream-server-${index}-port`}
															type="number"
															min="1"
															max="65535"
															className="form-control"
															name={`servers.${index}.port`}
															required
														/>
													</div>
													<div className="col-6 col-md-3">
														<label
															className="form-label"
															htmlFor={`upstream-server-${index}-weight`}
														>
															<T id="upstreams.server.weight" />
														</label>
														<Field
															id={`upstream-server-${index}-weight`}
															type="number"
															min="1"
															className="form-control"
															name={`servers.${index}.weight`}
														/>
													</div>
													<div className="col-6 col-md-3">
														<label
															className="form-label"
															htmlFor={`upstream-server-${index}-max-fails`}
														>
															<T id="upstreams.server.max-fails" />
														</label>
														<Field
															id={`upstream-server-${index}-max-fails`}
															type="number"
															min="1"
															className="form-control"
															name={`servers.${index}.maxFails`}
														/>
													</div>
													<div className="col-6 col-md-3">
														<label
															className="form-label"
															htmlFor={`upstream-server-${index}-fail-timeout`}
														>
															<T id="upstreams.server.fail-timeout" />
														</label>
														<Field
															id={`upstream-server-${index}-fail-timeout`}
															className="form-control"
															name={`servers.${index}.failTimeout`}
															placeholder="10s"
														/>
													</div>
													<div className="col-6 col-md-3">
														<label
															className="form-label"
															htmlFor={`upstream-server-${index}-max-conns`}
														>
															<T id="upstreams.server.max-conns" />
														</label>
														<Field
															id={`upstream-server-${index}-max-conns`}
															type="number"
															min="1"
															className="form-control"
															name={`servers.${index}.maxConns`}
														/>
													</div>
													<div className="col-md-6">
														<SwitchField
															id={`upstream-server-${index}-backup`}
															name={`servers.${index}.backup`}
															label="upstreams.server.backup"
															help="upstreams.server.backup.help"
														/>
													</div>
													<div className="col-md-6">
														<SwitchField
															id={`upstream-server-${index}-down`}
															name={`servers.${index}.down`}
															label="upstreams.server.down"
															help="upstreams.server.down.help"
														/>
													</div>
												</div>
											</div>
										</div>
									))}
								</Modal.Body>
								<Modal.Footer>
									<Button type="button" className="btn-link" onClick={remove}>
										<T id="cancel" />
									</Button>
									<Button type="submit" className="btn-blue" disabled={submitting}>
										<T id={submitting ? "upstreams.saving" : "upstreams.save-publish"} />
									</Button>
								</Modal.Footer>
							</Form>
						);
					}}
				</Formik>
			)}
		</Modal>
	);
});

export const showUpstreamModal = (id: number | "new") => EasyModal.show(UpstreamModal, { id });
