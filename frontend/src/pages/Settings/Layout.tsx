import cn from "classnames";
import { useState } from "react";
import { T } from "src/locale";
import DefaultSite from "./DefaultSite";
import NginxConfig from "./NginxConfig";

const SECTIONS = [
	{ id: "default-site", label: "settings.default-site" },
	{ id: "nginx", label: "settings.nginx" },
] as const;

type Section = (typeof SECTIONS)[number]["id"];

export default function Layout() {
	// Taken from https://preview.tabler.io/settings.html
	// Refer to that when updating this content
	const [section, setSection] = useState<Section>("default-site");

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
								{SECTIONS.map((item) => (
									<a
										key={item.id}
										href="#"
										data-testid={`settings-nav-${item.id}`}
										className={cn(
											"list-group-item list-group-item-action d-flex align-items-center",
											{
												active: section === item.id,
											},
										)}
										onClick={(e) => {
											e.preventDefault();
											setSection(item.id);
										}}
									>
										<T id={item.label} />
									</a>
								))}
							</div>
						</div>
					</div>
					<div className="col-12 col-md-9 d-flex flex-column">
						{section === "default-site" ? <DefaultSite /> : <NginxConfig />}
					</div>
				</div>
			</div>
		</div>
	);
}
