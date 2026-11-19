import { useState } from "react";
import { T } from "src/locale";
import DefaultSite from "./DefaultSite";
import TrafficStats from "./TrafficStats";

export default function Layout() {
	// Taken from https://preview.tabler.io/settings.html
	// Refer to that when updating this content
	const [tab, setTab] = useState<"default-site" | "traffic-stats">("default-site");

	const item = (id: typeof tab, label: string) => (
		<a
			href="#"
			className={`list-group-item list-group-item-action d-flex align-items-center${tab === id ? " active" : ""}`}
			onClick={(e) => {
				e.preventDefault();
				setTab(id);
			}}
		>
			<T id={label} />
		</a>
	);

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-teal" />
			<div className="card-table">
				<div className="card-header">
					<div className="row w-full">
						<h2 className="mt-1 mb-0">
							<T id="settings" />
						</h2>
					</div>
				</div>
				<div className="row g-0">
					<div className="col-12 col-md-3 border-end">
						<div className="card-body mt-0 pt-0">
							<div className="list-group list-group-transparent">
								{item("default-site", "settings.default-site")}
								{item("traffic-stats", "settings.traffic-stats")}
							</div>
						</div>
					</div>
					<div className="col-12 col-md-9 d-flex flex-column">
						{tab === "default-site" ? <DefaultSite /> : <TrafficStats />}
					</div>
				</div>
			</div>
		</div>
	);
}
