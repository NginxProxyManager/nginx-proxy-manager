import { T } from "src/locale";
import { useState } from "react";
import DefaultSite from "./DefaultSite";
import SSOSettings from "./SSO";

export default function Layout() {
	const [section, setSection] = useState<"default" | "sso">("default");
	// Taken from https://preview.tabler.io/settings.html
	// Refer to that when updating this content

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
								<a
									href="#"
									className={`list-group-item list-group-item-action d-flex align-items-center ${section === "default" ? "active" : ""}`}
									onClick={(e) => {
										e.preventDefault();
										setSection("default");
									}}
								>
									<T id="settings.default-site" />
								</a>
								<a
									href="#"
									className={`list-group-item list-group-item-action d-flex align-items-center ${section === "sso" ? "active" : ""}`}
									onClick={(e) => {
										e.preventDefault();
										setSection("sso");
									}}
								>
									<T id="settings.sso.title" />
								</a>
							</div>
						</div>
					</div>
					<div className="col-12 col-md-9 d-flex flex-column">
						{section === "default" ? <DefaultSite /> : <SSOSettings />}
					</div>
				</div>
			</div>
		</div>
	);
}
