import { IconShieldLock, IconUsers } from "@tabler/icons-react";
import { useState } from "react";
import { T } from "src/locale";
import AuthProviders from "./AuthProviders";
import TableWrapper from "./TableWrapper";

type Tab = "users" | "providers";

export default function Layout() {
	const [tab, setTab] = useState<Tab>("users");

	const tabClass = (name: Tab) => `nav-link${tab === name ? " active" : ""}`;

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-orange" />
			<ul className="nav nav-tabs">
				<li className="nav-item">
					<button type="button" className={tabClass("users")} onClick={() => setTab("users")}>
						<IconUsers size={16} className="me-1" />
						<T id="users" />
					</button>
				</li>
				<li className="nav-item">
					<button type="button" className={tabClass("providers")} onClick={() => setTab("providers")}>
						<IconShieldLock size={16} className="me-1" />
						<T id="auth-providers" />
					</button>
				</li>
			</ul>
			<div className="card-table">{tab === "users" ? <TableWrapper /> : <AuthProviders />}</div>
		</div>
	);
}
