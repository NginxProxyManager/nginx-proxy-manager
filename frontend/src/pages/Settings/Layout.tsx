import { IconHelp } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "src/components";
import { useUser } from "src/hooks";
import { T } from "src/locale";
import { showHelpModal } from "src/modals";
import { ADMIN, CREDENTIALS, hasPermission, VIEW } from "src/modules/Permissions";
import ApiKeys from "./ApiKeys";
import CredentialProviders from "./CredentialProviders";
import DefaultSite from "./DefaultSite";
import DnsCredentials from "./DnsCredentials";
import Webhooks from "./Webhooks";

export type SettingsTab = "default-site" | "dns-credentials" | "credential-providers" | "api-keys" | "webhooks";

const tabFromQuery = (raw: string | null, allowed: SettingsTab[]): SettingsTab => {
	if (raw && allowed.includes(raw as SettingsTab)) {
		return raw as SettingsTab;
	}
	return allowed[0] ?? "dns-credentials";
};

export default function Layout() {
	const { data } = useUser("me");
	const [searchParams, setSearchParams] = useSearchParams();

	const isAdmin = hasPermission(ADMIN, VIEW, data?.permissions, data?.roles);
	const canCredentials = hasPermission(CREDENTIALS, VIEW, data?.permissions, data?.roles);

	const allowedTabs = useMemo(() => {
		const tabs: SettingsTab[] = [];
		if (isAdmin) {
			tabs.push("default-site", "credential-providers", "api-keys", "webhooks");
		}
		if (isAdmin || canCredentials) {
			const insertAt = tabs.indexOf("credential-providers");
			if (insertAt === -1) {
				tabs.push("dns-credentials");
			} else {
				tabs.splice(insertAt, 0, "dns-credentials");
			}
		}
		return tabs;
	}, [isAdmin, canCredentials]);

	const [tab, setTab] = useState<SettingsTab>(() => tabFromQuery(searchParams.get("tab"), allowedTabs));

	useEffect(() => {
		const next = tabFromQuery(searchParams.get("tab"), allowedTabs);
		setTab(next);
	}, [searchParams, allowedTabs]);

	const selectTab = (next: SettingsTab) => {
		setTab(next);
		if (next === allowedTabs[0]) {
			setSearchParams({});
		} else {
			setSearchParams({ tab: next });
		}
	};

	const tabLabel: Record<SettingsTab, string> = {
		"default-site": "settings.default-site",
		"dns-credentials": "credentials",
		"credential-providers": "credential-providers",
		"api-keys": "api-keys",
		webhooks: "webhooks",
	};

	const tabPanel: Record<SettingsTab, ReactNode> = {
		"default-site": <DefaultSite />,
		"dns-credentials": <DnsCredentials />,
		"credential-providers": <CredentialProviders />,
		"api-keys": <ApiKeys />,
		webhooks: <Webhooks />,
	};

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-teal" />
			<div className="card-table">
				<div className="card-header">
					<div className="row w-full align-items-center">
						<div className="col">
							<h2 className="mt-1 mb-0">
								<T id="settings" />
							</h2>
						</div>
						<div className="col-auto">
							<Button size="sm" variant="outline" actionType="secondary" onClick={() => showHelpModal("Settings", "teal")}>
								<IconHelp size={20} />
							</Button>
						</div>
					</div>
				</div>
				<div className="row g-0">
					<div className="col-12 col-md-3 border-end">
						<div className="card-body mt-0 pt-0">
							<div className="list-group list-group-transparent">
								{allowedTabs.map((id) => (
									<button
										key={id}
										type="button"
										className={`list-group-item list-group-item-action ${tab === id ? "active" : ""}`}
										onClick={() => selectTab(id)}
									>
										<T id={tabLabel[id]} />
									</button>
								))}
							</div>
						</div>
					</div>
					<div className="col-12 col-md-9 d-flex flex-column">{tabPanel[tab]}</div>
				</div>
			</div>
		</div>
	);
}
