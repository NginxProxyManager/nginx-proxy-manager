import { IconChevronDown, IconChevronUp, IconTrash } from "@tabler/icons-react";
import CodeEditor from "@uiw/react-textarea-code-editor";
import cn from "classnames";
import { getIn, useFormikContext } from "formik";
import { useState } from "react";
import type { NginxMatchType, NginxPathMode, ProxyLocation } from "src/api/backend";
import { useUpstreams } from "src/hooks";
import { intl, T } from "src/locale";
import styles from "./LocationsFields.module.css";
import { ProxyDirectivesFields } from "./ProxyDirectivesFields";

interface Props {
	initialValues: ProxyLocation[];
	name?: string;
	defaultLocationEnabled?: boolean;
}

const matchOperators: Record<NginxMatchType, string> = {
	prefix: "",
	priority_prefix: "^~",
	exact: "=",
	regex: "~",
	regex_i: "~*",
};

const blankItem = (): ProxyLocation => ({
	path: "",
	advancedConfig: "",
	forwardScheme: "http",
	forwardHost: "",
	forwardPort: 80,
	matchType: "prefix",
	pathMode: "preserve_uri",
	nginxConfig: {},
	target: { type: "direct", scheme: "http", host: "", port: 80 },
});

export function LocationsFields({ initialValues, name = "locations", defaultLocationEnabled = true }: Props) {
	const { data: upstreams } = useUpstreams();
	const availableUpstreams = (upstreams || []).filter(
		(upstream) =>
			!upstream.isDisabled &&
			upstream.nginxAppliedEnabled &&
			["online", "degraded"].includes(upstream.nginxDeploymentStatus || ""),
	);
	const { values: formValues, setFieldValue } = useFormikContext<any>();
	const [values, setValues] = useState<ProxyLocation[]>(() => getIn(formValues, name) || initialValues || []);
	const [advancedVisible, setAdvancedVisible] = useState<number[]>([]);
	const [proxyDirectivesVisible, setProxyDirectivesVisible] = useState<number[]>(() =>
		(getIn(formValues, name) || initialValues || []).flatMap((item: ProxyLocation, index: number) =>
			Object.keys(item.nginxConfig || {}).length > 0 ? [index] : [],
		),
	);

	const currentValues = () => getIn(formValues, name) || values;

	const updateValues = (newValues: ProxyLocation[]) => {
		setValues(newValues);
		setFieldValue(name, newValues);
	};

	const rebaseVisibleIndexes = (current: number[], removedIndex: number) =>
		current
			.filter((itemIndex) => itemIndex !== removedIndex)
			.map((itemIndex) => (itemIndex > removedIndex ? itemIndex - 1 : itemIndex));

	const handleAdd = () => updateValues([...currentValues(), blankItem()]);

	const handleRemove = (index: number) => {
		updateValues(currentValues().filter((_: ProxyLocation, itemIndex: number) => itemIndex !== index));
		setAdvancedVisible((current) => rebaseVisibleIndexes(current, index));
		setProxyDirectivesVisible((current) => rebaseVisibleIndexes(current, index));
	};

	const handleChange = (index: number, field: keyof ProxyLocation, fieldValue: unknown) => {
		const newValues = currentValues().map((value: ProxyLocation, itemIndex: number) => {
			if (itemIndex !== index) return value;
			const next = { ...value, [field]: fieldValue };
			if (field === "matchType" && ["exact", "regex", "regex_i"].includes(String(fieldValue))) {
				next.pathMode = "preserve_uri";
				delete next.forwardPath;
			}
			if (field === "pathMode" && fieldValue !== "replace_prefix") delete next.forwardPath;
			return next;
		});
		updateValues(newValues);
	};

	const toggleAdvanced = (index: number) => {
		setAdvancedVisible((current) =>
			current.includes(index) ? current.filter((itemIndex) => itemIndex !== index) : [...current, index],
		);
	};

	const toggleProxyDirectives = (index: number) => {
		const visible = proxyDirectivesVisible.includes(index);
		const configured = Object.keys(currentValues()[index]?.nginxConfig || {}).length > 0;
		if (visible || configured) {
			handleChange(index, "nginxConfig", {});
			setProxyDirectivesVisible((current) => current.filter((itemIndex) => itemIndex !== index));
			return;
		}

		const serverOptions = { ...(getIn(formValues, "nginxConfig.server") || {}) };
		delete serverOptions.defaultLocationEnabled;
		handleChange(index, "nginxConfig", JSON.parse(JSON.stringify(serverOptions)));
		setProxyDirectivesVisible((current) => [...current, index]);
	};

	if (values.length === 0) {
		return (
			<div className="card border-dashed">
				<div className="card-body text-center py-5">
					<h4>
						<T id="proxy-host.location.empty" />
					</h4>
					<p className="text-secondary">
						<T
							id={
								defaultLocationEnabled
									? "proxy-host.location.empty.help"
									: "proxy-host.location.empty.help.no-default"
							}
						/>
					</p>
					<button type="button" className="btn btn-lime" onClick={handleAdd}>
						<T id="action.add-location" />
					</button>
				</div>
			</div>
		);
	}

	return (
		<>
			{values.map((item, index) => {
				const matchType = item.matchType || "prefix";
				const pathMode = item.pathMode || "preserve_uri";
				const pathModeLocked = ["exact", "regex", "regex_i"].includes(matchType);
				const target = item.target || {
					type: "direct" as const,
					scheme: item.forwardScheme || "http",
					host: item.forwardHost || "",
					port: item.forwardPort || 80,
				};
				const usingUpstream = target.type === "upstream";
				const locationSyntax = `location ${matchOperators[matchType]} ${item.path || "/path"}`.replace(
					"  ",
					" ",
				);
				return (
					<div key={index} className={cn("card", "card-active", "mb-3", styles.locationCard)}>
						<div className="card-header d-flex align-items-center">
							<div>
								<div className="text-secondary small">
									<T id="proxy-host.location.block" data={{ number: index + 1 }} />
								</div>
								<code>
									{locationSyntax} {"{"}
								</code>
							</div>
							<button
								type="button"
								className="btn btn-ghost-danger btn-sm ms-auto"
								onClick={() => handleRemove(index)}
								title={intl.formatMessage({ id: "action.delete" })}
							>
								<IconTrash size={18} />
							</button>
						</div>
						<div className="card-body">
							<div className="row">
								<div className="col-md-4">
									<label className="form-label" htmlFor={`location-match-${index}`}>
										<T id="proxy-host.location.match-type" />
									</label>
									<div className="form-hint mb-1">
										<T id="proxy-host.location.match-type.help" />
									</div>
									<select
										id={`location-match-${index}`}
										className="form-control"
										value={matchType}
										onChange={(event) =>
											handleChange(index, "matchType", event.target.value as NginxMatchType)
										}
									>
										<option value="prefix">
											<T id="proxy-host.location.match.prefix" />
										</option>
										<option value="priority_prefix">
											<T id="proxy-host.location.match.priority-prefix" />
										</option>
										<option value="exact">
											<T id="proxy-host.location.match.exact" />
										</option>
										<option value="regex">
											<T id="proxy-host.location.match.regex" />
										</option>
										<option value="regex_i">
											<T id="proxy-host.location.match.regex-i" />
										</option>
									</select>
								</div>
								<div className="col-md-8">
									<label className="form-label" htmlFor={`location-path-${index}`}>
										<T id="proxy-host.location.path" />
									</label>
									<div className="form-hint mb-1">
										<T id="proxy-host.location.path.help" />
									</div>
									<input
										id={`location-path-${index}`}
										type="text"
										className="form-control"
										placeholder={matchType.startsWith("regex") ? "^/api/v[0-9]+/" : "/api/"}
										autoComplete="off"
										value={item.path}
										onChange={(event) => handleChange(index, "path", event.target.value)}
									/>
								</div>
							</div>

							<hr className="my-4" />
							<div className="row g-3">
								<div className="col-md-3">
									<label className="form-label" htmlFor={`location-target-type-${index}`}>
										<T id="upstreams.target.type" />
									</label>
									<select
										id={`location-target-type-${index}`}
										className="form-select"
										value={target.type}
										onChange={(event) => {
											const type = event.target.value;
											handleChange(
												index,
												"target",
												type === "upstream"
													? {
															type,
															scheme: target.scheme || "http",
															upstreamId: availableUpstreams[0]?.id || 0,
														}
													: {
															type,
															scheme: target.scheme || "http",
															host: item.forwardHost || "",
															port: item.forwardPort || 80,
														},
											);
										}}
									>
										<option value="direct">
											<T id="upstreams.target.direct-server" />
										</option>
										<option value="upstream" disabled={!availableUpstreams.length}>
											<T id="upstreams.target.group" />
											{!availableUpstreams.length && (
												<>
													{" "}
													<T id="upstreams.target.none-published" />
												</>
											)}
										</option>
									</select>
								</div>
								<div className="col-md-3">
									<label className="form-label" htmlFor={`location-scheme-${index}`}>
										<T id="host.forward-scheme" />
									</label>
									<select
										id={`location-scheme-${index}`}
										className="form-select"
										value={target.scheme || "http"}
										onChange={(event) =>
											handleChange(index, "target", { ...target, scheme: event.target.value })
										}
									>
										<option value="http">http</option>
										<option value="https">https</option>
									</select>
								</div>
								{usingUpstream ? (
									<div className="col-md-6">
										<label className="form-label" htmlFor={`location-upstream-${index}`}>
											<T id="upstreams.target.group" />
										</label>
										<select
											id={`location-upstream-${index}`}
											className="form-select"
											required
											value={target.upstreamId || ""}
											onChange={(event) =>
												handleChange(index, "target", {
													...target,
													upstreamId: Number(event.target.value),
												})
											}
										>
											<option value="" disabled>
												<T id="upstreams.target.select" />
											</option>
											{availableUpstreams.map((upstream) => (
												<option key={upstream.id} value={upstream.id}>
													{upstream.name} ({upstream.nginxKey})
												</option>
											))}
										</select>
									</div>
								) : (
									<>
										<div className="col-md-4">
											<label className="form-label" htmlFor={`location-host-${index}`}>
												<T id="proxy-host.forward-host" />
											</label>
											<input
												id={`location-host-${index}`}
												type="text"
												className="form-control"
												required
												placeholder="10.0.0.20"
												value={target.host || ""}
												onChange={(event) =>
													handleChange(index, "target", {
														...target,
														host: event.target.value,
													})
												}
											/>
										</div>
										<div className="col-md-2">
											<label className="form-label" htmlFor={`location-port-${index}`}>
												<T id="host.forward-port" />
											</label>
											<input
												id={`location-port-${index}`}
												type="number"
												min={1}
												max={65535}
												className="form-control"
												required
												value={target.port || ""}
												onChange={(event) =>
													handleChange(index, "target", {
														...target,
														port: Number(event.target.value),
													})
												}
											/>
										</div>
									</>
								)}
							</div>

							<div className="row mt-3">
								<div className="col-md-6">
									<label className="form-label" htmlFor={`location-path-mode-${index}`}>
										<T id="proxy-host.location.path-mode" />
									</label>
									<select
										id={`location-path-mode-${index}`}
										className="form-control"
										value={pathMode}
										disabled={pathModeLocked}
										onChange={(event) =>
											handleChange(index, "pathMode", event.target.value as NginxPathMode)
										}
									>
										<option value="preserve_uri">
											<T id="proxy-host.location.path-mode.preserve" />
										</option>
										<option value="strip_prefix">
											<T id="proxy-host.location.path-mode.strip" />
										</option>
										<option value="replace_prefix">
											<T id="proxy-host.location.path-mode.replace" />
										</option>
									</select>
									<div className="form-hint">
										<T
											id={
												pathModeLocked
													? "proxy-host.location.path-mode.locked"
													: "proxy-host.location.path-mode.help"
											}
										/>
									</div>
								</div>
								{pathMode === "replace_prefix" ? (
									<div className="col-md-6">
										<label className="form-label" htmlFor={`location-forward-path-${index}`}>
											<T id="proxy-host.location.forward-path" />
										</label>
										<div className="form-hint mb-1">
											<T id="proxy-host.location.forward-path.help" />
										</div>
										<input
											id={`location-forward-path-${index}`}
											type="text"
											className="form-control"
											placeholder="/v2/"
											value={item.forwardPath || ""}
											onChange={(event) => handleChange(index, "forwardPath", event.target.value)}
										/>
									</div>
								) : null}
							</div>

							{(() => {
								const isProxyOverride =
									proxyDirectivesVisible.includes(index) ||
									Object.keys(item.nginxConfig || {}).length > 0;
								return (
									<div className="border-top mt-4 pt-3">
										<div className="d-flex flex-column flex-md-row gap-2 justify-content-between align-items-md-start">
											<div>
												<h5 className="mb-1">
													<T id="proxy-host.location.proxy-directives" />
												</h5>
												<p className="small text-secondary mb-0">
													<T
														id={
															isProxyOverride
																? "proxy-host.location.proxy-directives.override.help"
																: "proxy-host.location.proxy-directives.inherit.help"
														}
													/>
												</p>
											</div>
											<button
												type="button"
												className={`btn btn-sm ${isProxyOverride ? "btn-outline-secondary" : "btn-outline-lime"}`}
												onClick={() => toggleProxyDirectives(index)}
											>
												<T
													id={
														isProxyOverride
															? "proxy-host.location.proxy-directives.reset"
															: "proxy-host.location.proxy-directives.override"
													}
												/>
											</button>
										</div>
										{isProxyOverride ? (
											<ProxyDirectivesFields
												name={`${name}.${index}.nginxConfig`}
												scope="location"
											/>
										) : null}
									</div>
								);
							})()}

							<button
								type="button"
								className="btn btn-ghost-secondary btn-sm mt-4"
								onClick={() => toggleAdvanced(index)}
							>
								{advancedVisible.includes(index) ? (
									<IconChevronUp size={17} />
								) : (
									<IconChevronDown size={17} />
								)}
								<span className="ms-1">
									<T id="proxy-host.location.advanced" />
								</span>
							</button>
							{advancedVisible.includes(index) ? (
								<div className="mt-3">
									<p className="small text-secondary">
										<T id="proxy-host.location.advanced.help" />
									</p>
									<CodeEditor
										language="nginx"
										placeholder={intl.formatMessage({ id: "nginx-config.placeholder" })}
										padding={15}
										data-color-mode="dark"
										minHeight={170}
										indentWidth={2}
										value={item.advancedConfig}
										onChange={(event) => handleChange(index, "advancedConfig", event.target.value)}
										style={{
											fontFamily:
												"ui-monospace,SFMono-Regular,SF Mono,Consolas,Liberation Mono,Menlo,monospace",
											borderRadius: "0.3rem",
											minHeight: "170px",
											backgroundColor: "var(--tblr-bg-surface-dark)",
										}}
									/>
								</div>
							) : null}
						</div>
					</div>
				);
			})}
			<button type="button" className="btn btn-sm" onClick={handleAdd}>
				<T id="action.add-location" />
			</button>
		</>
	);
}
