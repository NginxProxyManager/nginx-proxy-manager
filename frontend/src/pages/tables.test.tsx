import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ defaultMessage, id }: { defaultMessage?: string; id: string }) => defaultMessage || id },
	T: ({ id }: { id: string }) => <>{id}</>,
}));

vi.mock("src/components", () => {
	const Value = (props: Record<string, unknown>) => <span>{String(props.value ?? props.email ?? props.name ?? "value")}</span>;
	return {
		AccessListFormatter: Value,
		CertificateFormatter: Value,
		CertificateInUseFormatter: Value,
		DateFormatter: Value,
		DomainsFormatter: ({ domains }: { domains?: string[] }) => <span>{domains?.join(", ")}</span>,
		EmailFormatter: Value,
		EmptyData: () => <div>empty-data</div>,
		EventFormatter: () => <span>event</span>,
		GravatarFormatter: Value,
		HasPermission: ({ children }: PropsWithChildren) => <>{children}</>,
		RolesFormatter: ({ roles }: { roles?: string[] }) => <span>{roles?.join(", ")}</span>,
		TrueFalseFormatter: ({ value }: { value: boolean }) => <span>{String(value)}</span>,
		ValueWithDateFormatter: Value,
	};
});

vi.mock("src/modals", () => ({
	showCustomCertificateModal: vi.fn(),
	showDNSCertificateModal: vi.fn(),
	showHTTPCertificateModal: vi.fn(),
}));

import AccessTable from "./Access/Table";
import AuditTable from "./AuditLog/Table";
import CertificateTable from "./Certificates/Table";
import DeadHostTable from "./Nginx/DeadHosts/Table";
import ProxyHostTable from "./Nginx/ProxyHosts/Table";
import RedirectionHostTable from "./Nginx/RedirectionHosts/Table";
import StreamTable from "./Nginx/Streams/Table";
import UserTable from "./Users/Table";

afterEach(cleanup);

const owner = { name: "Owner", avatar: "avatar" };
const action = (name: string, index = 0) => fireEvent.click(screen.getAllByText(name)[index]);

describe("resource tables", () => {
	it("renders access list and audit actions", () => {
		const edit = vi.fn();
		const remove = vi.fn();
		const { rerender } = render(
			<AccessTable
				data={[{ id: 2, owner, name: "Office", createdOn: "2026-01-01", items: [{}], clients: [{}, {}], satisfyAny: true, proxyHostCount: 3 }] as any}
				onEdit={edit}
				onDelete={remove}
			/>,
		);
		action("action.edit");
		action("action.delete");
		expect(edit).toHaveBeenCalledWith(2);
		expect(remove).toHaveBeenCalledWith(2);

		const select = vi.fn();
		rerender(<AuditTable data={[{ id: 4, user: owner, objectType: "proxy-host" }] as any} onSelectItem={select} />);
		action("action.view-details");
		expect(select).toHaveBeenCalledWith(4);
	});

	it("renders certificate providers and certificate actions", () => {
		const renew = vi.fn();
		const download = vi.fn();
		const remove = vi.fn();
		render(
			<CertificateTable
				data={[
					{ id: 5, owner, domainNames: ["cert.test"], createdOn: "2026-01-01", provider: "letsencrypt", meta: { dnsChallenge: true, dnsProvider: "cloudflare" }, expiresOn: "2027-01-01", isInUse: true },
					{ id: 6, owner, domainNames: ["custom.test"], createdOn: "2026-01-01", provider: "other", expiresOn: "2027-01-01", isInUse: false },
				] as any}
				onRenew={renew}
				onDownload={download}
				onDelete={remove}
			/>,
		);
		expect(screen.getByText(/cloudflare/)).toBeInTheDocument();
		for (const label of ["action.renew", "action.download", "action.delete"]) {
			const item = screen.queryAllByText(label)[0];
			if (item) fireEvent.click(item);
		}
		expect(download).toHaveBeenCalled();
		expect(remove).toHaveBeenCalled();
	});

	it("renders proxy targets, monitoring state, logs and management actions", () => {
		const callbacks = { edit: vi.fn(), logs: vi.fn(), monitor: vi.fn(), remove: vi.fn(), toggle: vi.fn() };
		render(
			<ProxyHostTable
				data={[
					{ id: 7, owner, domainNames: ["direct.test"], enabled: true, createdOn: "2026-01-01", forwardScheme: "http", forwardHost: "127.0.0.1", forwardPort: 8080, nginxDeploymentStatus: "ready", monitoringStatus: { status: "online" } },
					{ id: 8, owner, domainNames: [], enabled: false, createdOn: "2026-01-01", defaultTarget: { type: "upstream", scheme: "http", upstreamId: 9 }, nginxConfig: { listener: { mode: "port", port: 9000 } }, monitoringStatus: { status: "bad" } },
				] as any}
				upstreams={[{ id: 9, name: "api-cluster", nginxKey: "api_cluster" }] as any}
				onEdit={callbacks.edit}
				onLogs={callbacks.logs}
				onMonitoring={callbacks.monitor}
				onDelete={callbacks.remove}
				onDisableToggle={callbacks.toggle}
			/>,
		);
		expect(screen.getByText("api-cluster")).toBeInTheDocument();
		fireEvent.click(screen.getAllByRole("button", { name: "Monitoring" })[0]);
		fireEvent.click(screen.getAllByRole("button", { name: "Logs" })[0]);
		fireEvent.click(screen.getAllByRole("button", { name: "Monitoring" })[1]);
		fireEvent.click(screen.getAllByRole("button", { name: "Logs" })[1]);
		action("action.edit");
		action("action.disable");
		action("action.enable");
		action("action.delete");
		expect(callbacks.monitor).toHaveBeenCalledWith(7);
		expect(callbacks.logs).toHaveBeenCalledWith(7);
		expect(callbacks.edit).toHaveBeenCalledWith(7);
		expect(callbacks.toggle).toHaveBeenCalledWith(7, false);
		expect(callbacks.remove).toHaveBeenCalledWith(7);
	});

	it("renders and controls dead, redirection and stream hosts", () => {
		const callbacks = { edit: vi.fn(), logs: vi.fn(), remove: vi.fn(), toggle: vi.fn() };
		const common = { owner, enabled: true, createdOn: "2026-01-01", certificate: null };
		const { rerender } = render(
			<DeadHostTable data={[{ id: 10, ...common, domainNames: ["dead.test"], sslForced: false }] as any} onEdit={callbacks.edit} onLogs={callbacks.logs} onDelete={callbacks.remove} onDisableToggle={callbacks.toggle} />,
		);
		action("action.edit");
		action("action.disable");
		action("action.delete");

		rerender(<RedirectionHostTable data={[{ id: 11, ...common, domainNames: ["old.test"], forwardHttpCode: 301, forwardScheme: "https", forwardDomainName: "new.test", preservePath: true, sslForced: false }] as any} onEdit={callbacks.edit} onLogs={callbacks.logs} onDelete={callbacks.remove} onDisableToggle={callbacks.toggle} />);
		expect(screen.getByText("new.test")).toBeInTheDocument();
		action("action.edit"); action("action.disable"); action("action.delete");
		fireEvent.click(screen.getByRole("button", { name: "Logs" }));

		rerender(<StreamTable data={[{ id: 12, ...common, incomingPort: 8443, forwardingHost: "10.0.0.2", forwardingPort: 443, tcpForwarding: true, udpForwarding: false }] as any} onEdit={callbacks.edit} onLogs={callbacks.logs} onDelete={callbacks.remove} onDisableToggle={callbacks.toggle} />);
		expect(screen.getByText("8443")).toBeInTheDocument();
		action("action.edit"); action("action.disable"); action("action.delete");
		fireEvent.click(screen.getByRole("button", { name: "Logs" }));
		expect(callbacks.edit).toHaveBeenCalledWith(10);
		expect(callbacks.edit).toHaveBeenCalledWith(11);
		expect(callbacks.edit).toHaveBeenCalledWith(12);
	});

	it("renders user roles and invokes every available user action", () => {
		const callbacks = { edit: vi.fn(), permissions: vi.fn(), password: vi.fn(), remove: vi.fn(), toggle: vi.fn(), login: vi.fn() };
		render(
			<UserTable
				data={[{ id: 15, avatar: "a", name: "Alice", email: "a@test", roles: ["admin"], createdOn: "2026-01-01", isDisabled: false }] as any}
				currentUserId={1}
				onEditUser={callbacks.edit}
				onEditPermissions={callbacks.permissions}
				onSetPassword={callbacks.password}
				onDeleteUser={callbacks.remove}
				onDisableToggle={callbacks.toggle}
				onLoginAs={callbacks.login}
			/>,
		);
		for (const label of ["action.edit", "action.permissions", "user.set-password", "action.disable", "user.login-as", "action.delete"]) action(label);
		expect(callbacks.edit).toHaveBeenCalledWith(15);
		expect(callbacks.permissions).toHaveBeenCalledWith(15);
		expect(callbacks.password).toHaveBeenCalledWith(15);
		expect(callbacks.toggle).toHaveBeenCalledWith(15, false);
		expect(callbacks.login).toHaveBeenCalledWith(15);
		expect(callbacks.remove).toHaveBeenCalledWith(15);
	});
});
