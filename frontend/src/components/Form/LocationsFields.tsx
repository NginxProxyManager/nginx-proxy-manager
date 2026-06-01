import { IconSettings } from "@tabler/icons-react";
import CodeEditor from "@uiw/react-textarea-code-editor";
import cn from "classnames";
import { useFormikContext } from "formik";
import { useState } from "react";
import type { ProxyLocation } from "src/api/backend";
import { intl, T } from "src/locale";
import styles from "./LocationsFields.module.css";
import { UpstreamHostSelect } from "./UpstreamHostSelect";

interface Props {
	initialValues: ProxyLocation[];
	name?: string;
}
export function LocationsFields({ initialValues, name = "locations" }: Props) {
	const [values, setValues] = useState<ProxyLocation[]>(initialValues || []);
	const { setFieldValue } = useFormikContext();
	const [advVisible, setAdvVisible] = useState<number[]>([]);
	// User's explicit Direct/Upstream radio choice per location index. Needed
	// because the persisted shape only carries upstreamHostId — when the user
	// switches to Upstream but hasn't picked a host yet, upstreamHostId is 0
	// and a pure derivation would snap the radio back to Direct on re-render.
	const [targetTypeOverrides, setTargetTypeOverrides] = useState<Record<number, "direct" | "upstream">>({});

	const blankItem: ProxyLocation = {
		path: "",
		advancedConfig: "",
		forwardScheme: "http",
		forwardHost: "",
		forwardPort: 80,
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
		// Compact the override map so indices > idx shift down by one.
		setTargetTypeOverrides((prev) => {
			const next: Record<number, "direct" | "upstream"> = {};
			for (const [k, v] of Object.entries(prev)) {
				const i = Number(k);
				if (i < idx) next[i] = v;
				else if (i > idx) next[i - 1] = v;
			}
			return next;
		});
	};

	const handleChange = (idx: number, field: string, fieldValue: string | number) => {
		const newValues = values.map((v: ProxyLocation, i: number) => (i === idx ? { ...v, [field]: fieldValue } : v));
		setValues(newValues);
		setFormField(newValues);
	};

	const handleUpstreamChange = (idx: number, upstreamHostId: number) => {
		const newValues = values.map((v: ProxyLocation, i: number) =>
			i === idx
				? {
						...v,
						upstreamHostId,
						upstreamHostForwardScheme: v.upstreamHostForwardScheme || "http",
					}
				: v,
		);
		setValues(newValues);
		setFormField(newValues);
	};

	const handleTargetTypeChange = (idx: number, targetType: "direct" | "upstream") => {
		setTargetTypeOverrides((prev) => ({ ...prev, [idx]: targetType }));
		const newValues = values.map((v: ProxyLocation, i: number) =>
			i === idx
				? {
						...v,
						upstreamHostId: targetType === "direct" ? 0 : (v.upstreamHostId || 0),
					}
				: v,
		);
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
			{values.map((item: ProxyLocation, idx: number) => {
				const derivedTargetType = item.upstreamHostId && item.upstreamHostId > 0 ? "upstream" : "direct";
				const targetType = targetTypeOverrides[idx] ?? derivedTargetType;
				return (
				<div key={idx} className={cn("card", "card-active", "mb-3", styles.locationCard)}>
					<div className="card-body">
						<div className="row">
							<div className="col-md-10">
								<div className="input-group mb-3">
									<span className="input-group-text">Location</span>
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
						<div className="form-selectgroup form-selectgroup-boxes d-flex flex-column mb-3">
							<label className="form-selectgroup-item flex-fill">
								<input
									type="radio"
									name={`location-target-${idx}`}
									className="form-selectgroup-input"
									checked={targetType === "direct"}
									onChange={() => handleTargetTypeChange(idx, "direct")}
								/>
								<div className="form-selectgroup-label d-flex align-items-center p-2">
									<div className="me-3">
										<span className="form-selectgroup-check" />
									</div>
									<div>
										<strong><T id="proxy-host.forward-target-type.direct" /></strong>
										<div className="text-secondary small">
											<T id="proxy-host.forward-target-type.direct.description" />
										</div>
									</div>
								</div>
							</label>
							<label className="form-selectgroup-item flex-fill">
								<input
									type="radio"
									name={`location-target-${idx}`}
									className="form-selectgroup-input"
									checked={targetType === "upstream"}
									onChange={() => handleTargetTypeChange(idx, "upstream")}
								/>
								<div className="form-selectgroup-label d-flex align-items-center p-2">
									<div className="me-3">
										<span className="form-selectgroup-check" />
									</div>
									<div>
										<strong><T id="proxy-host.forward-target-type.upstream" /></strong>
										<div className="text-secondary small">
											<T id="proxy-host.forward-target-type.upstream.description" />
										</div>
									</div>
								</div>
							</label>
						</div>
						{targetType === "upstream" && (
							<div className="mb-3">
								<UpstreamHostSelect
									value={item.upstreamHostId || 0}
									onChange={(id) => handleUpstreamChange(idx, id)}
								/>
							</div>
						)}
						{targetType === "direct" && (
						<div className="row">
							<div className="col-md-3">
								<div className="mb-3">
									<label className="form-label" htmlFor={`forwardScheme-${idx}`}>
										<T id="host.forward-scheme" />
									</label>
									<select
										id={`forwardScheme-${idx}`}
										className="form-control"
										value={item.forwardScheme}
										onChange={(e) => handleChange(idx, "forwardScheme", e.target.value)}
									>
										<option value="http">http</option>
										<option value="https">https</option>
									</select>
								</div>
							</div>
							<div className="col-md-6">
								<div className="mb-3">
									<label className="form-label" htmlFor={`forwardHost-${idx}`}>
										<T id="proxy-host.forward-host" />
									</label>
									<input
										id={`forwardHost-${idx}`}
										type="text"
										className="form-control"
										required
										placeholder="eg: 10.0.0.1/path/"
										value={item.forwardHost}
										onChange={(e) => handleChange(idx, "forwardHost", e.target.value)}
									/>
								</div>
							</div>
							<div className="col-md-3">
								<div className="mb-3">
									<label className="form-label" htmlFor={`forwardPort-${idx}`}>
										<T id="host.forward-port" />
									</label>
									<input
										id={`forwardPort-${idx}`}
										type="number"
										min={1}
										max={65535}
										className="form-control"
										required
										placeholder="eg: 8081"
										value={item.forwardPort}
										onChange={(e) => handleChange(idx, "forwardPort", e.target.value)}
									/>
								</div>
							</div>
						</div>
						)}
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
				);
			})}
			<div>
				<button type="button" className="btn btn-sm" onClick={handleAdd}>
					<T id="action.add-location" />
				</button>
			</div>
		</>
	);
}
