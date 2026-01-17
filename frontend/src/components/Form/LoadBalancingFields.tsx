import { IconX } from "@tabler/icons-react";
import { useFormikContext } from "formik";
import { useState } from "react";
import type { LoadBalancingServer } from "src/api/backend";
import { T } from "src/locale";

interface Props {
	initialValues: LoadBalancingServer[];
	name?: string;
}

export function LoadBalancingFields({ initialValues, name = "loadBalancingServers" }: Props) {
	const [values, setValues] = useState<LoadBalancingServer[]>(initialValues || []);
	const { setFieldValue } = useFormikContext();

	const blankItem: LoadBalancingServer = {
		host: "",
		port: 80,
	};

	if (values.length === 0) {
		setValues([blankItem]);
	}

	const setFormField = (newValues: LoadBalancingServer[]) => {
		const filtered = newValues
			.map((item) => {
				const host = typeof item.host === "string" ? item.host.trim() : "";
				const port = Number.parseInt(String(item.port || ""), 10);
				const weight = Number.parseInt(String(item.weight || ""), 10);
				const normalized: LoadBalancingServer = {
					host,
					port: Number.isFinite(port) ? port : 0,
				};

				if (Number.isFinite(weight) && weight > 0) {
					normalized.weight = weight;
				}

				return normalized;
			})
			.filter((item) => item.host !== "" && item.port > 0);

		setFieldValue(name, filtered);
	};

	const handleAdd = () => {
		setValues([...values, blankItem]);
	};

	const handleRemove = (idx: number) => {
		const newValues = values.filter((_: LoadBalancingServer, i: number) => i !== idx);
		if (newValues.length === 0) {
			newValues.push(blankItem);
		}
		setValues(newValues);
		setFormField(newValues);
	};

	const handleChange = (idx: number, field: string, fieldValue: string) => {
		const newValues = values.map((value: LoadBalancingServer, i: number) => {
			if (i !== idx) {
				return value;
			}

			if (field === "port" || field === "weight") {
				const parsed = Number.parseInt(fieldValue, 10);
				return {
					...value,
					[field]: Number.isFinite(parsed) ? parsed : 0,
				};
			}

			return { ...value, [field]: fieldValue };
		});

		setValues(newValues);
		setFormField(newValues);
	};

	return (
		<>
			{values.map((item: LoadBalancingServer, idx: number) => (
				<div key={idx} className="row mb-2 align-items-end">
					<div className="col-md-5">
						<div className="mb-2">
							<label className="form-label" htmlFor={`loadBalancingHost-${idx}`}>
								<T id="load-balancing.host" />
							</label>
							<input
								id={`loadBalancingHost-${idx}`}
								type="text"
								className="form-control"
								placeholder="10.0.0.2"
								value={item.host}
								onChange={(e) => handleChange(idx, "host", e.target.value)}
							/>
						</div>
					</div>
					<div className="col-md-3">
						<div className="mb-2">
							<label className="form-label" htmlFor={`loadBalancingPort-${idx}`}>
								<T id="load-balancing.port" />
							</label>
							<input
								id={`loadBalancingPort-${idx}`}
								type="number"
								min={1}
								max={65535}
								className="form-control"
								placeholder="8080"
								value={item.port || ""}
								onChange={(e) => handleChange(idx, "port", e.target.value)}
							/>
						</div>
					</div>
					<div className="col-md-2">
						<div className="mb-2">
							<label className="form-label" htmlFor={`loadBalancingWeight-${idx}`}>
								<T id="load-balancing.weight" />
							</label>
							<input
								id={`loadBalancingWeight-${idx}`}
								type="number"
								min={1}
								max={100}
								className="form-control"
								placeholder="1"
								value={item.weight || ""}
								onChange={(e) => handleChange(idx, "weight", e.target.value)}
							/>
						</div>
					</div>
					<div className="col-md-2 d-flex justify-content-end">
						<a
							role="button"
							className="btn btn-ghost btn-danger p-0"
							onClick={(e) => {
								e.preventDefault();
								handleRemove(idx);
							}}
						>
							<IconX size={16} />
						</a>
					</div>
				</div>
			))}
			<div className="mb-2">
				<button type="button" className="btn btn-sm" onClick={handleAdd}>
					<T id="load-balancing.add-server" />
				</button>
			</div>
		</>
	);
}
