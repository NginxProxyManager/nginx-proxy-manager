import { IconInfoCircle } from "@tabler/icons-react";
import { Field, getIn, setIn, useFormikContext } from "formik";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Popover from "react-bootstrap/Popover";
import type { UpstreamServer } from "src/api/backend";
import { intl, T } from "src/locale";

const BACKUP_INCOMPATIBLE_METHODS = ["ip_hash"];
const FAIL_TIMEOUT_PATTERN = /^(?:0|[1-9][0-9]*[smhd]?)$/;
const NGINX_INT_MAX = 2_147_483_647;
const UPSTREAM_NAME_MAX_LENGTH = 128;
const UPSTREAM_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const AUTOMATIC_UPSTREAM_NAME_PATTERN = /^npm-/i;

type UpstreamServerForm = Omit<UpstreamServer, "port" | "weight" | "maxFails"> & {
	port?: number;
	weight?: number;
	maxFails?: number;
};

interface FormValues {
	forwardingMode?: "direct" | "upstream" | null;
	upstreamName?: string | null;
	upstreamServers?: UpstreamServerForm[];
	lbMethod?: string;
}

function InfoPopover({ messageId }: { messageId: string }) {
	const popover = (
		<Popover>
			<Popover.Body>{intl.formatMessage({ id: messageId })}</Popover.Body>
		</Popover>
	);
	return (
		<OverlayTrigger trigger={["hover", "focus"]} placement="top" overlay={popover}>
			<span className="ms-1 text-muted" style={{ cursor: "help" }}>
				<IconInfoCircle size={14} />
			</span>
		</OverlayTrigger>
	);
}

const required = () => intl.formatMessage({ id: "error.required" });
const minimum = (min: number) => intl.formatMessage({ id: "error.minimum" }, { min });
const maximum = (max: number) => intl.formatMessage({ id: "error.maximum" }, { max });
const maxLength = (max: number) => intl.formatMessage({ id: "error.max-character-length" }, { max });
const invalidHost = (host: string) => intl.formatMessage({ id: "error.invalid-domain" }, { domain: host });
const invalidFailTimeout = () => intl.formatMessage({ id: "error.invalid-fail-timeout" });
const invalidUpstreamName = () => intl.formatMessage({ id: "error.invalid-upstream-name" });
const reservedUpstreamName = () => intl.formatMessage({ id: "error.upstream-name-reserved" });

export const validateUpstreamServers = (values: FormValues) => {
	if (values.forwardingMode === "upstream" && !values.upstreamServers?.length) {
		return { upstreamServersGroup: intl.formatMessage({ id: "error.upstream-required" }) };
	}
	if (values.upstreamServers?.length && values.upstreamServers.every((server) => server.backup)) {
		return { upstreamServersGroup: intl.formatMessage({ id: "error.upstream-primary-required" }) };
	}
	return {};
};

const hasValidIpv6 = (host: string) => {
	try {
		new URL(`http://[${host}]/`);
		return true;
	} catch {
		return false;
	}
};

const hasValidHostShape = (host: string) => {
	if (host.startsWith("[") || host.endsWith("]")) {
		return /^\[([0-9A-Fa-f:.]+)\]$/.test(host) && hasValidIpv6(host.slice(1, -1));
	}
	if (host.includes(":")) {
		return /^[0-9A-Fa-f:.]+$/.test(host) && hasValidIpv6(host);
	}
	return /^(?:[A-Za-z0-9_](?:[A-Za-z0-9_-]{0,61}[A-Za-z0-9_])?\.)*[A-Za-z0-9_](?:[A-Za-z0-9_-]{0,61}[A-Za-z0-9_])?\.?$/.test(
		host,
	);
};

const validateHost = (value?: string) => {
	const host = value ?? "";
	if (!host) {
		return required();
	}
	if (host !== host.trim()) {
		return invalidHost(host);
	}
	if (host.length > (host.includes(":") ? 255 : 253)) {
		return maxLength(host.includes(":") ? 255 : 253);
	}
	return hasValidHostShape(host) ? undefined : invalidHost(value ?? "");
};

const validateInteger = (min: number, max?: number) => (value?: number) => {
	if (typeof value !== "number" || !Number.isInteger(value)) {
		return required();
	}
	if (value < min) {
		return minimum(min);
	}
	if (typeof max !== "undefined" && value > max) {
		return maximum(max);
	}
};

const validateFailTimeout = (value?: string) => {
	if (!value) {
		return required();
	}
	if (value.length > 12) {
		return maxLength(12);
	}
	return FAIL_TIMEOUT_PATTERN.test(value) ? undefined : invalidFailTimeout();
};

const validateUpstreamName = (value?: string | null) => {
	const name = value ?? "";
	if (!name) {
		return undefined;
	}
	if (name.length > UPSTREAM_NAME_MAX_LENGTH) {
		return maxLength(UPSTREAM_NAME_MAX_LENGTH);
	}
	if (AUTOMATIC_UPSTREAM_NAME_PATTERN.test(name)) {
		return reservedUpstreamName();
	}
	return UPSTREAM_NAME_PATTERN.test(name) ? undefined : invalidUpstreamName();
};

const numericValue = (value: string) => (value === "" ? undefined : Number(value));

export function UpstreamServersFields() {
	const { errors, setFieldTouched, setFieldValue, setFormikState, submitCount, touched, values } =
		useFormikContext<FormValues>();
	const servers = values.upstreamServers ?? [];
	const method = values.lbMethod ?? "round_robin";
	const upstreamName = values.upstreamName ?? "";

	const blankServer: UpstreamServerForm = {
		host: "",
		port: 80,
		weight: 1,
		maxFails: 1,
		failTimeout: "30s",
		backup: false,
		down: false,
	};

	const updateServers = (updated: UpstreamServerForm[]) => setFieldValue("upstreamServers", updated);
	const updateServer = (
		idx: number,
		field: keyof UpstreamServerForm,
		value: string | number | boolean | undefined,
	) => {
		updateServers(servers.map((server, index) => (index === idx ? { ...server, [field]: value } : server)));
	};
	const hasError = (field: string) => Boolean(getIn(errors, field) && (getIn(touched, field) || submitCount > 0));
	const error = (field: string) => getIn(errors, field) as string | undefined;
	const groupError = error("upstreamServersGroup");
	const showGroupError = Boolean(groupError && submitCount > 0);
	const upstreamNameError = error("upstreamName");
	const showUpstreamNameError = hasError("upstreamName");

	const handleAdd = () => updateServers([...servers, blankServer]);
	const handleRemove = (idx: number) => {
		const updatedServers = servers.filter((_, index) => index !== idx);
		const removeArrayItem = (items: unknown) => {
			if (!Array.isArray(items)) {
				return items;
			}
			const updatedItems = items.slice();
			updatedItems.splice(idx, 1);
			return updatedItems.every((item) => typeof item === "undefined") ? undefined : updatedItems;
		};

		setFormikState((state) => ({
			...state,
			values: setIn(state.values, "upstreamServers", updatedServers),
			errors: setIn(state.errors, "upstreamServers", removeArrayItem(getIn(state.errors, "upstreamServers"))),
			touched: setIn(
				state.touched,
				"upstreamServers",
				removeArrayItem(getIn(state.touched, "upstreamServers")),
			),
		}));
		updateServers(updatedServers);
	};
	const handleMethodChange = (newMethod: string) => {
		if (BACKUP_INCOMPATIBLE_METHODS.includes(newMethod)) {
			updateServers(servers.map((server) => ({ ...server, backup: false })));
		}
		setFieldValue("lbMethod", newMethod);
	};

	const backupDisabled = BACKUP_INCOMPATIBLE_METHODS.includes(method);
	const upstreamNameField = (
		<div className="mb-4">
			<label className="form-label" htmlFor="upstreamName">
				<T id="upstream.name" />
			</label>
			<Field name="upstreamName" validate={validateUpstreamName}>
				{() => (
					<input
						id="upstreamName"
						type="text"
						maxLength={UPSTREAM_NAME_MAX_LENGTH}
						className={`form-control ${showUpstreamNameError ? "is-invalid" : ""}`}
						aria-describedby={
							showUpstreamNameError ? "upstream-name-help upstream-name-error" : "upstream-name-help"
						}
						aria-invalid={showUpstreamNameError}
						autoComplete="off"
						value={upstreamName}
						onBlur={() => setFieldTouched("upstreamName", true)}
						onChange={(event) => setFieldValue("upstreamName", event.target.value)}
					/>
				)}
			</Field>
			<div id="upstream-name-help" className="form-text">
				<T id="upstream.name.help" />
			</div>
			{showUpstreamNameError && (
				<div id="upstream-name-error" className="invalid-feedback d-block" role="alert">
					{upstreamNameError}
				</div>
			)}
		</div>
	);

	if (servers.length === 0) {
		return (
			<>
				{upstreamNameField}
				{showGroupError && (
					<div className="alert alert-danger" role="alert">
						{groupError}
					</div>
				)}
				<div className="text-center">
					<p className="text-muted mt-3">
						<T id="upstream.description" />
					</p>
					<button type="button" className="btn my-2" onClick={handleAdd}>
						<T id="upstream.add-server" />
					</button>
				</div>
			</>
		);
	}

	return (
		<>
			{upstreamNameField}
			<div className="mb-4">
				<label className="form-label" htmlFor="lbMethod">
					<T id="upstream.method" />
					<InfoPopover messageId="upstream.method.help" />
				</label>
				<select
					id="lbMethod"
					className="form-select"
					aria-describedby={showGroupError ? "upstream-servers-group-error" : undefined}
					aria-invalid={showGroupError}
					value={method}
					onChange={(event) => handleMethodChange(event.target.value)}
				>
					<option value="round_robin">{intl.formatMessage({ id: "upstream.method.round_robin" })}</option>
					<option value="least_conn">{intl.formatMessage({ id: "upstream.method.least_conn" })}</option>
					<option value="ip_hash">{intl.formatMessage({ id: "upstream.method.ip_hash" })}</option>
				</select>
				{showGroupError && (
					<div id="upstream-servers-group-error" className="invalid-feedback d-block" role="alert">
						{groupError}
					</div>
				)}
			</div>

			{servers.map((server, idx) => {
				const hostName = `upstreamServers.${idx}.host`;
				const portName = `upstreamServers.${idx}.port`;
				const weightName = `upstreamServers.${idx}.weight`;
				const maxFailsName = `upstreamServers.${idx}.maxFails`;
				const failTimeoutName = `upstreamServers.${idx}.failTimeout`;
				return (
					<div key={idx} className="card card-active mb-3">
						<div className="card-body">
							<div className="row g-2 mb-2">
								<div className="col-sm-6">
									<label className="form-label" htmlFor={`upstream-host-${idx}`}>
										<T id="upstream.host" />
									</label>
									<Field name={hostName} validate={validateHost}>
										{() => (
											<input
												id={`upstream-host-${idx}`}
												type="text"
												className={`form-control ${hasError(hostName) ? "is-invalid" : ""}`}
												placeholder="192.168.1.1"
												autoComplete="off"
												value={server.host}
												onBlur={() => setFieldTouched(hostName, true)}
												onChange={(event) => updateServer(idx, "host", event.target.value)}
											/>
										)}
									</Field>
									{hasError(hostName) && (
										<div className="invalid-feedback d-block">{error(hostName)}</div>
									)}
								</div>
								<div className="col-sm-2">
									<label className="form-label" htmlFor={`upstream-port-${idx}`}>
										<T id="upstream.port" />
									</label>
									<Field name={portName} validate={validateInteger(1, 65535)}>
										{() => (
											<input
												id={`upstream-port-${idx}`}
												type="number"
												step="any"
												className={`form-control ${hasError(portName) ? "is-invalid" : ""}`}
												placeholder="80"
												value={server.port ?? ""}
												onBlur={() => setFieldTouched(portName, true)}
												onChange={(event) =>
													updateServer(idx, "port", numericValue(event.target.value))
												}
											/>
										)}
									</Field>
									{hasError(portName) && (
										<div className="invalid-feedback d-block">{error(portName)}</div>
									)}
								</div>
								<div className="col-sm-2">
									<label className="form-label" htmlFor={`upstream-weight-${idx}`}>
										<T id="upstream.weight" />
										<InfoPopover messageId="upstream.weight.help" />
									</label>
									<Field name={weightName} validate={validateInteger(1, NGINX_INT_MAX)}>
										{() => (
											<input
												id={`upstream-weight-${idx}`}
												type="number"
												step="any"
												className={`form-control ${hasError(weightName) ? "is-invalid" : ""}`}
												value={server.weight ?? ""}
												onBlur={() => setFieldTouched(weightName, true)}
												onChange={(event) =>
													updateServer(idx, "weight", numericValue(event.target.value))
												}
											/>
										)}
									</Field>
									{hasError(weightName) && (
										<div className="invalid-feedback d-block">{error(weightName)}</div>
									)}
								</div>
							</div>
							<div className="row g-2">
								<div className="col-sm-3">
									<label className="form-label" htmlFor={`upstream-maxfails-${idx}`}>
										<T id="upstream.max-fails" />
										<InfoPopover messageId="upstream.max-fails.help" />
									</label>
									<Field name={maxFailsName} validate={validateInteger(0, NGINX_INT_MAX)}>
										{() => (
											<input
												id={`upstream-maxfails-${idx}`}
												type="number"
												step="any"
												className={`form-control ${hasError(maxFailsName) ? "is-invalid" : ""}`}
												value={server.maxFails ?? ""}
												onBlur={() => setFieldTouched(maxFailsName, true)}
												onChange={(event) =>
													updateServer(idx, "maxFails", numericValue(event.target.value))
												}
											/>
										)}
									</Field>
									{hasError(maxFailsName) && (
										<div className="invalid-feedback d-block">{error(maxFailsName)}</div>
									)}
								</div>
								<div className="col-sm-3">
									<label className="form-label" htmlFor={`upstream-failtimeout-${idx}`}>
										<T id="upstream.fail-timeout" />
										<InfoPopover messageId="upstream.fail-timeout.help" />
									</label>
									<Field name={failTimeoutName} validate={validateFailTimeout}>
										{() => (
											<input
												id={`upstream-failtimeout-${idx}`}
												type="text"
												maxLength={12}
												className={`form-control ${hasError(failTimeoutName) ? "is-invalid" : ""}`}
												placeholder="30s"
												value={server.failTimeout}
												onBlur={() => setFieldTouched(failTimeoutName, true)}
												onChange={(event) =>
													updateServer(idx, "failTimeout", event.target.value)
												}
											/>
										)}
									</Field>
									{hasError(failTimeoutName) && (
										<div className="invalid-feedback d-block">{error(failTimeoutName)}</div>
									)}
								</div>
								<div className="col-sm-3 d-flex align-items-end">
									<OverlayTrigger
										trigger={backupDisabled ? ["hover", "focus"] : []}
										placement="top"
										overlay={
											<Popover>
												<Popover.Body>
													{intl.formatMessage({ id: "upstream.backup.help" })}
												</Popover.Body>
											</Popover>
										}
									>
										<label className="form-check form-switch mb-2">
											<input
												type="checkbox"
												className="form-check-input"
												checked={server.backup}
												disabled={backupDisabled}
												onChange={(event) => updateServer(idx, "backup", event.target.checked)}
											/>
											<span className="form-check-label">
												<T id="upstream.backup" />
												<InfoPopover messageId="upstream.backup.help" />
											</span>
										</label>
									</OverlayTrigger>
								</div>
								<div className="col-sm-3 d-flex align-items-end">
									<label className="form-check form-switch mb-2">
										<input
											type="checkbox"
											className="form-check-input"
											checked={server.down}
											onChange={(event) => updateServer(idx, "down", event.target.checked)}
										/>
										<span className="form-check-label">
											<T id="upstream.down" />
											<InfoPopover messageId="upstream.down.help" />
										</span>
									</label>
								</div>
							</div>
							<div className="mt-1">
								<a
									href="#"
									onClick={(event) => {
										event.preventDefault();
										handleRemove(idx);
									}}
								>
									<T id="action.delete" />
								</a>
							</div>
						</div>
					</div>
				);
			})}

			<div>
				<button type="button" className="btn btn-sm" onClick={handleAdd}>
					<T id="upstream.add-server" />
				</button>
			</div>
		</>
	);
}
