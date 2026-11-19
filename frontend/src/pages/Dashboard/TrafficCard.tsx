import { useState } from "react";
import { RANGES, TrafficPanel } from "src/components/TrafficPanel";
import { useTrafficReport } from "src/hooks";
import { T } from "src/locale";

const TrafficCard = () => {
	const [hours, setHours] = useState<number | undefined>(undefined);
	const { data, error } = useTrafficReport(hours);

	// A failing storage (bad InfluxDB token, server down, ...) is shown, not mistaken for "switched off"
	if (error && !data) {
		return (
			<div className="col-12 mb-4">
				<div className="w-100">
					<h3 className="mb-2">
						<T id="traffic.title" />
					</h3>
					<div className="alert alert-danger">{error.message}</div>
				</div>
			</div>
		);
	}
	if (!data?.enabled || !data.range) {
		return null;
	}
	const active = hours ?? data.range.hours;

	return (
		<div className="col-12 mb-4">
			<div className="w-100">
				<div className="d-flex flex-wrap justify-content-between align-items-end mb-3">
					<div>
						<h3 className="mb-0">
							<T id="traffic.title" />
						</h3>
						<div className="text-secondary">
							<T id="traffic.subtitle" />
						</div>
					</div>
					<div className="btn-group">
						{RANGES.map((r) => (
							<button
								key={r.hours}
								type="button"
								className={`btn btn-sm ${active === r.hours ? "btn-primary" : "btn-outline-secondary"}`}
								onClick={() => setHours(r.hours)}
							>
								{r.label}
							</button>
						))}
					</div>
				</div>
				<TrafficPanel data={data} />
			</div>
		</div>
	);
};

export default TrafficCard;
