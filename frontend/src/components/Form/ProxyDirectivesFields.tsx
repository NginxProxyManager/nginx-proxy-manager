import { IconHelpCircle } from "@tabler/icons-react";
import cn from "classnames";
import { Field, getIn } from "formik";
import { createContext, useContext } from "react";
import { intl, T } from "src/locale";
import { appendProxyOverrideKey, proxyOptionKeyFromFieldName } from "src/modules/NginxProxyOptions";

interface SwitchFieldProps {
	name: string;
	label: string;
	help?: string;
}

interface ProxyDirectivesFieldsProps {
	name: string;
	scope: "server" | "location";
	overrideKeysName?: string;
	allowProxyRedirectDefault?: boolean;
}

type ManagedFieldChange = (fieldName: string, form: any) => void;
const ManagedFieldChangeContext = createContext<ManagedFieldChange | undefined>(undefined);

function HelpIcon({ help }: { help: string }) {
	const description = intl.formatMessage({ id: help });
	return (
		<span className="ms-1 text-secondary align-text-bottom" role="img" title={description} aria-label={description}>
			<IconHelpCircle size={15} stroke={1.8} aria-hidden="true" />
		</span>
	);
}

function FieldLabel({ label, help, htmlFor }: { label: string; help: string; htmlFor?: string }) {
	return (
		<label className="form-label" htmlFor={htmlFor}>
			<T id={label} />
			<HelpIcon help={help} />
		</label>
	);
}

function ProxySwitchField({ name, label, help }: Required<SwitchFieldProps>) {
	const notifyManagedChange = useContext(ManagedFieldChangeContext);
	return (
		<Field name={name}>
			{({ field, form }: any) => (
				<label className="row py-2" htmlFor={name}>
					<span className="col">
						<span className="d-block">
							<T id={label} />
						</span>
						<span className="d-block small text-secondary">
							<T id={help} />
						</span>
					</span>
					<span className="col-auto">
						<span className="form-check form-check-single form-switch">
							<input
								id={name}
								name={field.name}
								checked={field.value === true}
								className={cn("form-check-input", { "bg-lime": field.value === true })}
								onBlur={field.onBlur}
								onChange={(event) => {
									notifyManagedChange?.(name, form);
									form.setFieldValue(name, event.currentTarget.checked);
								}}
								type="checkbox"
							/>
						</span>
					</span>
				</label>
			)}
		</Field>
	);
}

function TextField({
	name,
	label,
	help,
	placeholder,
	type = "text",
	min,
}: {
	name: string;
	label: string;
	help: string;
	placeholder?: string;
	type?: "text" | "number";
	min?: number;
}) {
	const notifyManagedChange = useContext(ManagedFieldChangeContext);
	return (
		<Field name={name}>
			{({ field, form }: any) => (
				<div className="mb-3">
					<FieldLabel label={label} help={help} htmlFor={name} />
					<input
						id={name}
						type={type}
						min={type === "number" ? (min ?? 0) : undefined}
						className="form-control"
						placeholder={placeholder}
						{...field}
						onChange={(event) => {
							notifyManagedChange?.(name, form);
							field.onChange(event);
						}}
						value={field.value ?? ""}
					/>
				</div>
			)}
		</Field>
	);
}

function SelectField({
	name,
	label,
	options,
	help,
}: {
	name: string;
	label: string;
	help: string;
	options: Array<{ value: string; label: string; disabled?: boolean }>;
}) {
	const notifyManagedChange = useContext(ManagedFieldChangeContext);
	return (
		<Field name={name}>
			{({ field, form }: any) => (
				<div className="mb-3">
					<FieldLabel label={label} help={help} htmlFor={name} />
					<select
						id={name}
						className="form-control"
						{...field}
						onChange={(event) => {
							notifyManagedChange?.(name, form);
							field.onChange(event);
						}}
						value={field.value ?? ""}
					>
						{options.map((option) => (
							<option key={option.value} value={option.value} disabled={option.disabled}>
								<T id={option.label} />
							</option>
						))}
					</select>
				</div>
			)}
		</Field>
	);
}

function CheckboxListField({
	name,
	label,
	help,
	options,
}: {
	name: string;
	label: string;
	help: string;
	options: Array<{ value: string; label: string }>;
}) {
	const notifyManagedChange = useContext(ManagedFieldChangeContext);
	return (
		<Field name={name}>
			{({ field, form }: any) => {
				const values = Array.isArray(field.value) ? field.value : [];
				return (
					<div className="mb-3">
						<div className="form-label mb-2">
							<T id={label} />
							<HelpIcon help={help} />
						</div>
						<div className="d-flex flex-wrap gap-2">
							{options.map((option) => (
								<label key={option.value} className="form-check form-check-inline m-0">
									<input
										className="form-check-input"
										type="checkbox"
										checked={values.includes(option.value)}
										onChange={(event) => {
											notifyManagedChange?.(name, form);
											form.setFieldValue(
												name,
												event.currentTarget.checked
													? [...values, option.value]
													: values.filter((value: string) => value !== option.value),
											);
										}}
									/>
									<span className="form-check-label">
										<T id={option.label} />
									</span>
								</label>
							))}
						</div>
					</div>
				);
			}}
		</Field>
	);
}

function HeaderRules({
	name,
	label,
	help,
	operationHelp = "nginx-options.header-operation.help",
	allowAdd = true,
	allowRemove = false,
}: {
	name: string;
	label: string;
	help: string;
	operationHelp?: string;
	allowAdd?: boolean;
	allowRemove?: boolean;
}) {
	const notifyManagedChange = useContext(ManagedFieldChangeContext);
	return (
		<Field name={name}>
			{({ field, form }: any) => {
				const rules = Array.isArray(field.value) ? field.value : [];
				const setRules = (nextRules: any[]) => {
					notifyManagedChange?.(name, form);
					return form.setFieldValue(name, nextRules);
				};
				const update = (index: number, key: string, value: string) =>
					setRules(
						rules.map((rule: any, ruleIndex: number) =>
							ruleIndex === index ? { ...rule, [key]: value } : rule,
						),
					);
				return (
					<div className="mb-3">
						<div className="form-label mb-2">
							<T id={label} />
							<HelpIcon help={help} />
						</div>
						{rules.map((rule: any, index: number) => (
							<div className="border rounded p-2 mb-2" key={index}>
								<div className="row g-2 align-items-end">
									<div className="col-md-3">
										<label
											className="form-label small mb-1"
											htmlFor={`${name}-header-name-${index}`}
										>
											<T id="nginx-options.header-name" />
											<HelpIcon help="nginx-options.header-name.help" />
										</label>
										<input
											id={`${name}-header-name-${index}`}
											className="form-control"
											placeholder="X-Example"
											value={rule.name || ""}
											onChange={(event) => update(index, "name", event.currentTarget.value)}
										/>
									</div>
									<div className="col-md-3">
										<label
											className="form-label small mb-1"
											htmlFor={`${name}-header-operation-${index}`}
										>
											<T id="nginx-options.header-operation" />
											<HelpIcon help={operationHelp} />
										</label>
										<select
											id={`${name}-header-operation-${index}`}
											className="form-control"
											value={rule.operation || "set"}
											onChange={(event) => update(index, "operation", event.currentTarget.value)}
										>
											<option value="set">
												<T id="nginx-options.header-set" />
											</option>
											{allowAdd ? (
												<option value="add">
													<T id="nginx-options.header-add" />
												</option>
											) : null}
											{allowRemove ? (
												<option value="remove">
													<T id="nginx-options.header-remove" />
												</option>
											) : null}
										</select>
									</div>
									{rule.operation !== "remove" ? (
										<>
											<div className="col-md-2">
												<label
													className="form-label small mb-1"
													htmlFor={`${name}-header-mode-${index}`}
												>
													<T id="nginx-options.header-mode" />
													<HelpIcon help="nginx-options.header-mode.help" />
												</label>
												<select
													id={`${name}-header-mode-${index}`}
													className="form-control"
													value={rule.valueMode || "literal"}
													onChange={(event) =>
														update(index, "valueMode", event.currentTarget.value)
													}
												>
													<option value="literal">
														<T id="nginx-options.literal" />
													</option>
													<option value="variable">
														<T id="nginx-options.variable" />
													</option>
												</select>
											</div>
											<div className="col-md-3">
												<label
													className="form-label small mb-1"
													htmlFor={`${name}-header-value-${index}`}
												>
													<T id="nginx-options.header-value" />
													<HelpIcon help="nginx-options.header-value.help" />
												</label>
												<input
													id={`${name}-header-value-${index}`}
													className="form-control"
													placeholder={
														rule.valueMode === "variable" ? "$request_id" : "value"
													}
													value={rule.value || ""}
													onChange={(event) =>
														update(index, "value", event.currentTarget.value)
													}
												/>
											</div>
										</>
									) : (
										<div className="col-md-5" />
									)}
									<div className="col-md-1">
										<button
											type="button"
											className="btn btn-outline-danger w-100"
											onClick={() =>
												setRules(
													rules.filter((_: any, ruleIndex: number) => ruleIndex !== index),
												)
											}
										>
											<T id="action.delete" />
										</button>
									</div>
								</div>
							</div>
						))}
						<button
							type="button"
							className="btn btn-outline-secondary btn-sm"
							onClick={() =>
								setRules([...rules, { name: "", operation: "set", valueMode: "literal", value: "" }])
							}
						>
							<T id="action.add" />
						</button>
					</div>
				);
			}}
		</Field>
	);
}

function CookieRewriteRules({ name, label, help }: { name: string; label: string; help: string }) {
	const notifyManagedChange = useContext(ManagedFieldChangeContext);
	return (
		<Field name={name}>
			{({ field, form }: any) => {
				const rules = Array.isArray(field.value) ? field.value : [];
				const setRules = (nextRules: any[]) => {
					notifyManagedChange?.(name, form);
					return form.setFieldValue(name, nextRules);
				};
				const update = (index: number, key: "from" | "to", value: string) =>
					setRules(
						rules.map((rule: any, ruleIndex: number) =>
							ruleIndex === index ? { ...rule, [key]: value } : rule,
						),
					);
				return (
					<div className="mb-3">
						<div className="form-label mb-1">
							<T id={label} />
						</div>
						<div className="form-hint mb-2">
							<T id={help} />
						</div>
						{rules.map((rule: any, index: number) => (
							<div className="row g-2 align-items-end mb-2" key={index}>
								<div className="col-md-5">
									<FieldLabel
										label="nginx-options.cookie-from"
										help="nginx-options.cookie-from.help"
										htmlFor={`${name}-from-${index}`}
									/>
									<input
										id={`${name}-from-${index}`}
										className="form-control"
										placeholder="example.internal"
										value={rule.from || ""}
										onChange={(event) => update(index, "from", event.currentTarget.value)}
									/>
								</div>
								<div className="col-md-5">
									<FieldLabel
										label="nginx-options.cookie-to"
										help="nginx-options.cookie-to.help"
										htmlFor={`${name}-to-${index}`}
									/>
									<input
										id={`${name}-to-${index}`}
										className="form-control"
										placeholder="example.com"
										value={rule.to || ""}
										onChange={(event) => update(index, "to", event.currentTarget.value)}
									/>
								</div>
								<div className="col-md-2">
									<button
										type="button"
										className="btn btn-outline-danger w-100"
										onClick={() =>
											setRules(rules.filter((_: any, ruleIndex: number) => ruleIndex !== index))
										}
									>
										<T id="action.delete" />
									</button>
								</div>
							</div>
						))}
						<button
							type="button"
							className="btn btn-outline-secondary btn-sm"
							onClick={() => setRules([...rules, { from: "", to: "" }])}
						>
							<T id="action.add" />
						</button>
					</div>
				);
			}}
		</Field>
	);
}

function ProxyDirectivesFields({
	name,
	scope,
	overrideKeysName,
	allowProxyRedirectDefault = true,
}: ProxyDirectivesFieldsProps) {
	const field = (key: string) => `${name}.${key}`;
	const markManagedChange: ManagedFieldChange | undefined = overrideKeysName
		? (fieldName, form) => {
				const optionKey = proxyOptionKeyFromFieldName(name, fieldName);
				if (!optionKey) return;
				const current = getIn(form.values, overrideKeysName);
				const next = appendProxyOverrideKey(current, optionKey);
				if (next !== current) form.setFieldValue(overrideKeysName, next, false);
			}
		: undefined;

	return (
		<ManagedFieldChangeContext.Provider value={markManagedChange}>
			<div>
				<h4 className="mb-1">
					<T
						id={
							scope === "server"
								? "proxy-host.wizard.structured-options"
								: "proxy-host.location.proxy-directives"
						}
					/>
				</h4>
				<p className="text-secondary mb-3">
					<T
						id={
							scope === "server"
								? "nginx-options.structured-help"
								: "proxy-host.location.proxy-directives.help"
						}
					/>
				</p>

				<h5 className="mb-3">
					<T id="nginx-options.protocol-request" />
				</h5>
				<div className="row">
					<div className="col-md-4">
						<SelectField
							name={field("proxyHttpVersion")}
							label="nginx-options.proxy-http-version"
							help="nginx-options.proxy-http-version.help"
							options={[
								...(scope === "location" ? [{ value: "", label: "nginx-options.inherit" }] : []),
								{ value: "1.0", label: "nginx-options.http-1-0" },
								{ value: "1.1", label: "nginx-options.http-1-1" },
							]}
						/>
					</div>
					<div className="col-md-4">
						<SelectField
							name={field("proxyMethod")}
							label="nginx-options.proxy-method"
							help="nginx-options.proxy-method.help"
							options={[
								{ value: "$request_method", label: "nginx-options.inherit" },
								...["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((value) => ({
									value,
									label: `nginx-options.method-${value.toLowerCase()}`,
								})),
							]}
						/>
					</div>
					<div className="col-md-4">
						<TextField
							name={field("clientMaxBodySize")}
							label="nginx-options.client-max-body-size"
							help="nginx-options.client-max-body-size.help"
							placeholder="50m"
						/>
					</div>
				</div>
				<div className="divide-y mb-4">
					<ProxySwitchField
						name={field("proxyPassRequestHeaders")}
						label="nginx-options.proxy-pass-request-headers"
						help="nginx-options.proxy-pass-request-headers.help"
					/>
					<ProxySwitchField
						name={field("proxyPassRequestBody")}
						label="nginx-options.proxy-pass-request-body"
						help="nginx-options.proxy-pass-request-body.help"
					/>
					<ProxySwitchField
						name={field("proxyPassTrailers")}
						label="nginx-options.proxy-pass-trailers"
						help="nginx-options.proxy-pass-trailers.help"
					/>
					<ProxySwitchField
						name={field("proxyRequestBuffering")}
						label="nginx-options.proxy-request-buffering"
						help="proxy-host.wizard.request-buffering.help"
					/>
				</div>

				<h5 className="mb-3">
					<T id="nginx-options.timeouts-failover" />
				</h5>
				<div className="row">
					{[
						["proxyConnectTimeout", "nginx-options.proxy-connect-timeout"],
						["proxySendTimeout", "nginx-options.proxy-send-timeout"],
						["proxyReadTimeout", "nginx-options.proxy-read-timeout"],
						["proxyNextUpstreamTimeout", "nginx-options.proxy-next-upstream-timeout"],
					].map(([fieldName, label]) => (
						<div className="col-md-3" key={fieldName}>
							<TextField
								name={field(fieldName)}
								label={label}
								help={`nginx-options.${label.replace("nginx-options.", "")}.help`}
								placeholder="60 / 60s"
							/>
						</div>
					))}
				</div>
				<p className="form-text mt-n2 mb-3">
					<T id="nginx-options.timeout-format-help" />
				</p>
				<div className="row">
					<div className="col-md-4">
						<TextField
							name={field("proxyNextUpstreamTries")}
							label="nginx-options.proxy-next-upstream-tries"
							help="nginx-options.proxy-next-upstream-tries.help"
							type="number"
							placeholder="3"
						/>
					</div>
					<div className="col-md-4">
						<TextField
							name={field("proxyBind")}
							label="nginx-options.proxy-bind"
							help="nginx-options.proxy-bind.help"
							placeholder="192.0.2.10"
						/>
					</div>
				</div>
				<CheckboxListField
					name={field("proxyNextUpstream")}
					label="nginx-options.proxy-next-upstream"
					help="nginx-options.proxy-next-upstream.help"
					options={[
						{ value: "error", label: "nginx-options.failover-error" },
						{ value: "timeout", label: "nginx-options.failover-timeout" },
						{ value: "invalid_header", label: "nginx-options.failover-invalid-header" },
						{ value: "http_500", label: "nginx-options.failover-500" },
						{ value: "http_502", label: "nginx-options.failover-502" },
						{ value: "http_503", label: "nginx-options.failover-503" },
						{ value: "http_504", label: "nginx-options.failover-504" },
						{ value: "http_429", label: "nginx-options.failover-429" },
						{ value: "non_idempotent", label: "nginx-options.failover-non-idempotent" },
					]}
				/>
				<div className="divide-y mb-4">
					<ProxySwitchField
						name={field("proxyIgnoreClientAbort")}
						label="nginx-options.proxy-ignore-client-abort"
						help="nginx-options.proxy-ignore-client-abort.help"
					/>
					<ProxySwitchField
						name={field("proxySocketKeepalive")}
						label="nginx-options.proxy-socket-keepalive"
						help="nginx-options.proxy-socket-keepalive.help"
					/>
				</div>

				<h5 className="mb-3">
					<T id="nginx-options.response-buffering" />
				</h5>
				<div className="row">
					{[
						["proxyBufferSize", "nginx-options.proxy-buffer-size", "8k"],
						["proxyBusyBuffersSize", "nginx-options.proxy-busy-buffers-size", "16k"],
						["proxyMaxTempFileSize", "nginx-options.proxy-max-temp-file-size", "1024m"],
						["proxyTempFileWriteSize", "nginx-options.proxy-temp-file-write-size", "16k"],
						["proxyLimitRate", "nginx-options.proxy-limit-rate", "0"],
					].map(([fieldName, label, placeholder]) => (
						<div className="col-md-4" key={fieldName}>
							<TextField
								name={field(fieldName)}
								label={label}
								help={`nginx-options.${label.replace("nginx-options.", "")}.help`}
								placeholder={placeholder}
							/>
						</div>
					))}
					<div className="col-md-2">
						<TextField
							name={field("proxyBuffers.0")}
							label="nginx-options.proxy-buffers-count"
							help="nginx-options.proxy-buffers-count.help"
							type="number"
							placeholder="8"
						/>
					</div>
					<div className="col-md-2">
						<TextField
							name={field("proxyBuffers.1")}
							label="nginx-options.proxy-buffers-size"
							help="nginx-options.proxy-buffers-size.help"
							placeholder="8k"
						/>
					</div>
					<div className="col-md-4">
						<TextField
							name={field("proxyHeadersHashBucketSize")}
							label="nginx-options.proxy-headers-hash-bucket-size"
							help="nginx-options.proxy-headers-hash-bucket-size.help"
							type="number"
							min={1}
							placeholder="64"
						/>
					</div>
					<div className="col-md-4">
						<TextField
							name={field("proxyHeadersHashMaxSize")}
							label="nginx-options.proxy-headers-hash-max-size"
							help="nginx-options.proxy-headers-hash-max-size.help"
							type="number"
							min={1}
							placeholder="512"
						/>
					</div>
				</div>
				<div className="divide-y mb-4">
					<ProxySwitchField
						name={field("proxyBuffering")}
						label="nginx-options.proxy-buffering"
						help="proxy-host.wizard.proxy-buffering.help"
					/>
					<ProxySwitchField
						name={field("proxyInterceptErrors")}
						label="nginx-options.proxy-intercept-errors"
						help="nginx-options.proxy-intercept-errors.help"
					/>
					<ProxySwitchField
						name={field("proxyForceRanges")}
						label="nginx-options.proxy-force-ranges"
						help="nginx-options.proxy-force-ranges.help"
					/>
				</div>

				<h5 className="mb-3">
					<T id="nginx-options.response-handling" />
				</h5>
				<div className="row">
					<div className="col-lg-6">
						<HeaderRules
							name={field("requestHeaders")}
							label="nginx-options.request-headers"
							help="nginx-options.request-headers.help"
							operationHelp="nginx-options.header-operation.request.help"
							allowAdd={false}
							allowRemove
						/>
					</div>
					<div className="col-lg-6">
						<HeaderRules
							name={field("responseHeaders")}
							label="nginx-options.response-headers"
							help="nginx-options.response-headers.help"
							operationHelp="nginx-options.header-operation.response.help"
							allowRemove
						/>
					</div>
				</div>
				<div className="row">
					<div className="col-md-6">
						<TextField
							name={field("hideResponseHeadersInput")}
							label="nginx-options.proxy-hide-header"
							help="nginx-options.proxy-hide-header.help"
							placeholder="X-Powered-By, X-AspNet-Version"
						/>
					</div>
					<div className="col-md-6">
						<TextField
							name={field("proxyPassHeadersInput")}
							label="nginx-options.proxy-pass-header"
							help="nginx-options.proxy-pass-header.help"
							placeholder="Date, Server"
						/>
					</div>
					<div className="col-md-6">
						<SelectField
							name={field("proxyRedirect")}
							label="nginx-options.proxy-redirect"
							help="nginx-options.proxy-redirect.help"
							options={[
								...(scope === "location" ? [{ value: "", label: "nginx-options.inherit" }] : []),
								{
									value: "default",
									label: "nginx-options.redirect-default",
									disabled: scope === "server" && !allowProxyRedirectDefault,
								},
								{ value: "off", label: "nginx-options.redirect-off" },
							]}
						/>
					</div>
				</div>
				<CheckboxListField
					name={field("proxyIgnoreHeaders")}
					label="nginx-options.proxy-ignore-headers"
					help="nginx-options.proxy-ignore-headers.help"
					options={[
						{ value: "X-Accel-Expires", label: "nginx-options.x-accel-expires" },
						{ value: "X-Accel-Redirect", label: "nginx-options.x-accel-redirect" },
						{ value: "X-Accel-Limit-Rate", label: "nginx-options.x-accel-limit-rate" },
						{ value: "X-Accel-Buffering", label: "nginx-options.x-accel-buffering" },
						{ value: "X-Accel-Charset", label: "nginx-options.x-accel-charset" },
						{ value: "Expires", label: "nginx-options.expires" },
						{ value: "Cache-Control", label: "nginx-options.cache-control" },
						{ value: "Set-Cookie", label: "nginx-options.set-cookie" },
						{ value: "Vary", label: "nginx-options.vary" },
					]}
				/>
				<div className="form-hint mb-4">
					<T id="nginx-options.header-input-help" />
				</div>

				<h5 className="mb-3">
					<T id="nginx-options.cookie-rewrite" />
				</h5>
				<div className="row">
					<div className="col-lg-6">
						<CookieRewriteRules
							name={field("proxyCookieDomain")}
							label="nginx-options.proxy-cookie-domain"
							help="nginx-options.cookie-rewrite-help"
						/>
					</div>
					<div className="col-lg-6">
						<CookieRewriteRules
							name={field("proxyCookiePath")}
							label="nginx-options.proxy-cookie-path"
							help="nginx-options.cookie-rewrite-help"
						/>
					</div>
				</div>

				<h5 className="mb-3">
					<T id="nginx-options.upstream-tls" />
				</h5>
				<div className="row">
					<div className="col-md-6">
						<TextField
							name={field("proxySslName")}
							label="nginx-options.proxy-ssl-name"
							help="nginx-options.proxy-ssl-name.help"
							placeholder="upstream.example.com"
						/>
					</div>
					<div className="col-md-3">
						<TextField
							name={field("proxySslVerifyDepth")}
							label="nginx-options.proxy-ssl-verify-depth"
							help="nginx-options.proxy-ssl-verify-depth.help"
							type="number"
							placeholder="1"
						/>
					</div>
					<div className="col-md-3">
						<TextField
							name={field("proxySslCiphers")}
							label="nginx-options.proxy-ssl-ciphers"
							help="nginx-options.proxy-ssl-ciphers.help"
							placeholder="HIGH:!aNULL"
						/>
					</div>
				</div>
				<CheckboxListField
					name={field("proxySslProtocols")}
					label="nginx-options.proxy-ssl-protocols"
					help="nginx-options.proxy-ssl-protocols.help"
					options={[
						{ value: "TLSv1", label: "nginx-options.tlsv1" },
						{ value: "TLSv1.1", label: "nginx-options.tlsv1-1" },
						{ value: "TLSv1.2", label: "nginx-options.tlsv1-2" },
						{ value: "TLSv1.3", label: "nginx-options.tlsv1-3" },
					]}
				/>
				<div className="divide-y">
					<ProxySwitchField
						name={field("proxySslServerName")}
						label="nginx-options.proxy-ssl-server-name"
						help="proxy-host.wizard.sni.help"
					/>
					<ProxySwitchField
						name={field("proxySslVerify")}
						label="nginx-options.proxy-ssl-verify"
						help="nginx-options.proxy-ssl-verify.help"
					/>
					<ProxySwitchField
						name={field("proxySslSessionReuse")}
						label="nginx-options.proxy-ssl-session-reuse"
						help="nginx-options.proxy-ssl-session-reuse.help"
					/>
				</div>
			</div>
		</ManagedFieldChangeContext.Provider>
	);
}

export { ProxyDirectivesFields };
