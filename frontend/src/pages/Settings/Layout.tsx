import { useState } from "react";
import { T } from "src/locale";
import CredentialProviders from "./CredentialProviders";
import DefaultSite from "./DefaultSite";

import ApiKeys from "./ApiKeys";
import Webhooks from "./Webhooks";

type SettingsTab = "default-site" | "credential-providers" | "api-keys" | "webhooks";

export default function Layout() {
	const [tab, setTab] = useState<SettingsTab>("default-site");
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
								<button
									type="button"
									className={`list-group-item list-group-item-action ${tab === "default-site" ? "active" : ""}`}
									onClick={() => setTab("default-site")}
								>
									<T id="settings.default-site" />
								</button>
								<button
									type="button"
									className={`list-group-item list-group-item-action ${tab === "credential-providers" ? "active" : ""}`}
									onClick={() => setTab("credential-providers")}
								>
									<T id="credential-providers" />
								</button>
								<button
									type="button"
									className={`list-group-item list-group-item-action ${tab === "api-keys" ? "active" : ""}`}
									onClick={() => setTab("api-keys")}
								>
									<T id="api-keys" />
								</button>
								<button
									type="button"
									className={`list-group-item list-group-item-action ${tab === "webhooks" ? "active" : ""}`}
									onClick={() => setTab("webhooks")}
								>
									<T id="webhooks" />
								</button>
							</div>
						</div>
					</div>
					<div className="col-12 col-md-9 d-flex flex-column">
						{tab === "default-site" && <DefaultSite />}
						{tab === "credential-providers" && <CredentialProviders />}
						{tab === "api-keys" && <ApiKeys />}
						{tab === "webhooks" && <Webhooks />}
					</div>
				</div>
			</div>
		</div>
	);
}
