import { useState } from "react";
import { T } from "src/locale";
import DefaultSite from "./DefaultSite";
import OIDC from "./OIDC";

export default function Layout() {
	const [section, setSection] = useState(
		new URLSearchParams(window.location.search).has("oidc") ? "oidc" : "default",
	);
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
									className={
										"list-group-item list-group-item-action d-flex align-items-center" +
										(section === "default" ? " active" : "")
									}
									onClick={(e) => {
										e.preventDefault();
										setSection("default");
									}}
								>
									<T id="settings.default-site" />
								</a>
								<a
									href="?oidc"
									className={
										"list-group-item list-group-item-action d-flex align-items-center" +
										(section === "oidc" ? " active" : "")
									}
									onClick={(e) => {
										e.preventDefault();
										setSection("oidc");
									}}
								>
									<T id="oidc.title" />
								</a>
							</div>
						</div>
					</div>
					<div className="col-12 col-md-9 d-flex flex-column">
						{section === "oidc" ? <OIDC /> : <DefaultSite />}
					</div>
				</div>
			</div>
		</div>
	);
}
