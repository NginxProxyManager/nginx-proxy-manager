import { IconX } from "@tabler/icons-react";
import cn from "classnames";
import { useFormikContext } from "formik";
import { useState } from "react";
import type { AccessListClient } from "src/api/backend";
import { intl, T } from "src/locale";

interface Props {
	initialValues: AccessListClient[];
	name?: string;
}
export function AccessClientFields({ initialValues, name = "clients" }: Props) {
	const [values, setValues] = useState<AccessListClient[]>(initialValues || []);
	const { setFieldValue } = useFormikContext();

	const blankClient: AccessListClient = { directive: "allow", address: "" };

	if (values?.length === 0) {
		setValues([blankClient]);
	}

	const handleAdd = () => {
		setValues([...values, blankClient]);
	};

	const handleRemove = (idx: number) => {
		const newValues = values.filter((_: AccessListClient, i: number) => i !== idx);
		if (newValues.length === 0) {
			newValues.push(blankClient);
		}
		setValues(newValues);
		setFormField(newValues);
	};

	const handleChange = (idx: number, field: string, fieldValue: string) => {
		const newValues = values.map((v: AccessListClient, i: number) =>
			i === idx ? { ...v, [field]: fieldValue } : v,
		);
		setValues(newValues);
		setFormField(newValues);
	};

	const setFormField = (newValues: AccessListClient[]) => {
		const filtered = newValues.filter((v: AccessListClient) => v?.address?.trim() !== "");
		setFieldValue(name, filtered);
	};

	return (
		<>
			<p className="text-muted">
				<T id="access-list.help.rules-order" />
			</p>
			{values.map((client: AccessListClient, idx: number) => (
				<div className="row mb-1" key={idx}>
					<div className="col-11">
						<div className="input-group mb-2">
							<span className="input-group-select">
								<select
									className={cn(
										"form-select",
										"m-0",
										client.directive === "allow" ? "bg-lime-lt" : "bg-orange-lt",
									)}
									name={`clients[${idx}].directive`}
									value={client.directive}
									onChange={(e) => handleChange(idx, "directive", e.target.value)}
								>
									<option value="allow"><T id="action.allow" /></option>
									<option value="deny"><T id="action.deny" /></option>
								</select>
							</span>
							<input
								name={`clients[${idx}].address`}
								type="text"
								className="form-control"
								autoComplete="off"
								value={client.address}
								onChange={(e) => handleChange(idx, "address", e.target.value)}
								placeholder={intl.formatMessage({ id: "access-list.rule-source.placeholder" })}
							/>
						</div>
					</div>
					<div className="col-1">
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
			<div className="mb-3">
				<button type="button" className="btn btn-sm" onClick={handleAdd}>
					<T id="action.add" />
				</button>
			</div>
			<div className="row mb-3">
				<p className="text-muted">
					<T id="access-list.help-rules-last" />
				</p>
				<div className="col-11">
					<div className="input-group mb-2">
						<span className="input-group-select">
							<select
								className="form-select m-0 bg-orange-lt"
								name="clients[last].directive"
								value="deny"
								disabled
							>
								<option value="deny"><T id="action.deny" /></option>
							</select>
						</span>
						<input
							name="clients[last].address"
							type="text"
							className="form-control"
							autoComplete="off"
							value="all"
							disabled
						/>
					</div>
				</div>
			</div>
		</>
	);
}
