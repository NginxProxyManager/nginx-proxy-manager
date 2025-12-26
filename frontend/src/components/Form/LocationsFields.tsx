import { IconSettings } from "@tabler/icons-react";
import CodeEditor from "@uiw/react-textarea-code-editor";
import cn from "classnames";
import { useFormikContext } from "formik";
import { useState } from "react";
import type { ProxyLocation } from "src/api/backend";
import { intl, T } from "src/locale";
import styles from "./LocationsFields.module.css";

interface Props {
	initialValues: ProxyLocation[];
	name?: string;
}
export function LocationsFields({ initialValues, name = "locations" }: Props) {
	const [values, setValues] = useState<ProxyLocation[]>(initialValues || []);
	const { setFieldValue } = useFormikContext();
	const [advVisible, setAdvVisible] = useState<number[]>([]);

	const blankItem: ProxyLocation = {
		path: "",
		locationType: "",
		advancedConfig: "",
		forwardScheme: "http",
		forwardHost: "",
		forwardPort: 80,
		cachingEnabled: false,
		blockExploits: false,
		allowWebsocketUpgrade: false,
	};

	const toggleAdvVisible = (idx: number) => {
		setAdvVisible(advVisible.includes(idx) ? advVisible.filter((i) => i !== idx) : [...advVisible, idx]);
	};

	const handleAdd = () => {
		setValues([...values, blankItem]);
	};

	const handleRemove = (idx: number) => {
		const newValues = values.filter((_: ProxyLocation, i: number) => i !== idx);
		setValues(newValues);
		setFormField(newValues);
	};

	const handleChange = (idx: number, field: string, fieldValue: any) => {
		const newValues = values.map((v: ProxyLocation, i: number) => (i === idx ? { ...v, [field]: fieldValue } : v));
		setValues(newValues);
		setFormField(newValues);
	};

	const setFormField = (newValues: ProxyLocation[]) => {
		const filtered = newValues.filter((v: ProxyLocation) => v?.path?.trim() !== "");
		setFieldValue(name, filtered);
	};

	if (values.length === 0) {
		return (
			<div className="text-center">
				<button type="button" className="btn my-3" onClick={handleAdd}>
					<T id="action.add-location" />
				</button>
			</div>
		);
	}

	return (
		<>
			{values.map((item: ProxyLocation, idx: number) => (
				<div key={idx} className={cn("card", "card-active", "mb-3", styles.locationCard)}>
					<div className="card-body">
						<div className="row">
							<div className="col-md-10">
								<div className="input-group mb-3">
									<span className="input-group-text">Location</span>
									<select
										id="locationType"
										className="form-select w-auto flex-grow-0"
										value={item.locationType}
										onChange={(e) => handleChange(idx, "locationType", e.target.value)}
									>
										<option value="" />
										<option value="@">@</option>
										<option value="= ">=</option>
										<option value="~ ">~</option>
										<option value="~* ">~*</option>
										<option value="^~ ">^~</option>
									</select>
									<input
										type="text"
										className="form-control"
										placeholder="/path"
										autoComplete="off"
										value={item.path}
										onChange={(e) => handleChange(idx, "path", e.target.value)}
									/>
								</div>
							</div>
							<div className="col-md-2 text-end">
								<button
									type="button"
									className="btn p-0"
									title="Advanced"
									onClick={() => toggleAdvVisible(idx)}
								>
									<IconSettings size={20} />
								</button>
							</div>
						</div>
						<div className="row">
							<div className="col-md-3">
								<div className="mb-3">
									<label className="form-label" htmlFor="forwardScheme">
										<T id="host.forward-scheme" />
									</label>
									<select
										id="forwardScheme"
										className="form-select"
										value={item.forwardScheme}
										onChange={(e) => handleChange(idx, "forwardScheme", e.target.value)}
									>
										<option value="http">http</option>
										<option value="https">https</option>
										<option value="path">path</option>
										<option value="empty">empty</option>
										<option value="grpc">grpc</option>
										<option value="grpcs">grpcs</option>
									</select>
								</div>
							</div>
							<div className="col-md-6">
								<div className="mb-3">
									<label className="form-label" htmlFor="forwardHost">
										<T id="proxy-host.forward-host" />
									</label>
									<input
										id="forwardHost"
										type="text"
										className="form-control"
										placeholder="eg: 10.0.0.1/path/"
										value={item.forwardHost}
										onChange={(e) => handleChange(idx, "forwardHost", e.target.value)}
									/>
								</div>
							</div>
							<div className="col-md-3">
								<div className="mb-3">
									<label className="form-label" htmlFor="forwardPort">
										<T id="host.forward-port" />
									</label>
									<input
										id="forwardPort"
										type="number"
										min={1}
										max={65535}
										className="form-control"
										placeholder="eg: 8081"
										value={item.forwardPort}
										onChange={(e) => handleChange(idx, "forwardPort", e.target.value)}
									/>
								</div>
							</div>
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
												<label className="form-check form-check-single form-switch">
													<input
														id="cachingEnabled"
														className={cn("form-check-input", {
															"bg-lime": item.cachingEnabled,
														})}
														type="checkbox"
														checked={item.cachingEnabled}
														onChange={(e) =>
															handleChange(idx, "cachingEnabled", e.target.checked)
														}
													/>
												</label>
											</span>
										</label>
									</div>
									<div style={{ display: "none" }}>
										<label className="row" htmlFor="blockExploits">
											<span className="col">
												<T id="host.flags.block-exploits" />
											</span>
											<span className="col-auto">
												<label className="form-check form-check-single form-switch">
													<input
														id="blockExploits"
														className={cn("form-check-input", {
															"bg-lime": item.blockExploits,
														})}
														type="checkbox"
														checked={item.blockExploits}
														onChange={(e) =>
															handleChange(idx, "blockExploits", e.target.checked)
														}
													/>
												</label>
											</span>
										</label>
									</div>
									<div>
										<label className="row" htmlFor="allowWebsocketUpgrade">
											<span className="col">
												<T id="host.flags.fancyindex-upstream-compression" />
											</span>
											<span className="col-auto">
												<label className="form-check form-check-single form-switch">
													<input
														id="allowWebsocketUpgrade"
														className={cn("form-check-input", {
															"bg-lime": item.allowWebsocketUpgrade,
														})}
														type="checkbox"
														checked={item.allowWebsocketUpgrade}
														onChange={(e) =>
															handleChange(idx, "allowWebsocketUpgrade", e.target.checked)
														}
													/>
												</label>
											</span>
										</label>
									</div>
								</div>
							</div>
						</div>
						{advVisible.includes(idx) && (
							<div className="">
								<CodeEditor
									language="nginx"
									placeholder={intl.formatMessage({ id: "nginx-config.placeholder" })}
									padding={15}
									data-color-mode="dark"
									minHeight={170}
									indentWidth={2}
									value={item.advancedConfig}
									onChange={(e) => handleChange(idx, "advancedConfig", e.target.value)}
									style={{
										fontFamily:
											"ui-monospace,SFMono-Regular,SF Mono,Consolas,Liberation Mono,Menlo,monospace",
										borderRadius: "0.3rem",
										minHeight: "170px",
									}}
								/>
							</div>
						)}
						<div className="mt-1">
							<a
								href="#"
								onClick={(e) => {
									e.preventDefault();
									handleRemove(idx);
								}}
							>
								<T id="action.delete" />
							</a>
						</div>
					</div>
				</div>
			))}
			<div>
				<button type="button" className="btn btn-sm" onClick={handleAdd}>
					<T id="action.add-location" />
				</button>
			</div>
		</>
	);
}
