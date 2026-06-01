import { IconX } from "@tabler/icons-react";
import { useFormikContext } from "formik";
import type { LoadBalancingServer } from "src/api/backend";
import { T } from "src/locale";

interface Props {
	name?: string;
}

const blankItem: LoadBalancingServer = {
	host: "",
	port: 80,
};

// Formik is the single source of truth: the parent owns `values[name]` and we
// mutate it directly. When the bound array is empty we render one synthetic
// blank row so the user has something to fill in; the moment they type, the
// row is promoted into the real array.
export function LoadBalancingFields({ name = "loadBalancingServers" }: Props) {
	const { values: formValues, setFieldValue } = useFormikContext<any>();
	const stored: LoadBalancingServer[] = (formValues?.[name] as LoadBalancingServer[]) || [];
	const display = stored.length ? stored : [blankItem];

	const write = (next: LoadBalancingServer[]) => setFieldValue(name, next);

	// "Add" appends to what's visible, not just what's stored, so clicking Add on
	// an empty form promotes the synthetic row AND adds a second one — matching
	// the user's mental model of "Add another".
	const handleAdd = () => write([...display, blankItem]);

	const handleRemove = (idx: number) => {
		// If the user removes the synthetic row, stored is still []; nothing to do.
		if (!stored.length) return;
		write(stored.filter((_: LoadBalancingServer, i: number) => i !== idx));
	};

	const handleChange = (idx: number, field: "host" | "port" | "weight", fieldValue: string) => {
		// Editing the synthetic blank row promotes it into stored.
		const base = stored.length ? stored : [blankItem];
		const next = base.map((value: LoadBalancingServer, i: number) => {
			if (i !== idx) return value;
			if (field === "port" || field === "weight") {
				const parsed = Number.parseInt(fieldValue, 10);
				return { ...value, [field]: Number.isFinite(parsed) ? parsed : 0 };
			}
			return { ...value, [field]: fieldValue };
		});
		write(next);
	};

	return (
		<>
			{display.map((item: LoadBalancingServer, idx: number) => (
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
