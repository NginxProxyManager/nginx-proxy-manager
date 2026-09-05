import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	props: {} as Record<string, any>, api: vi.fn().mockResolvedValue({}), invalidate: vi.fn(), modal: vi.fn(),
	loginAs: vi.fn().mockResolvedValue({}), refetch: vi.fn(), success: vi.fn(), error: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidate }) }));
vi.mock("src/components", () => ({
	Button: ({ children, size: _size, actionType: _actionType, isLoading: _isLoading, ...props }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & any>) => <button {...props}>{children}</button>,
	HasPermission: ({ children }: PropsWithChildren) => <>{children}</>, LoadingPage: () => <div>loading</div>,
}));
vi.mock("src/context", () => ({ useAuthState: () => ({ loginAs: mocks.loginAs }) }));
vi.mock("src/locale", () => ({ intl: { formatMessage: ({ defaultMessage, id }: any) => defaultMessage || id }, T: ({ id }: { id: string }) => <>{id}</> }));
vi.mock("src/notifications", () => ({ showError: (...args: any[]) => mocks.error(...args), showObjectSuccess: (...args: any[]) => mocks.success(...args) }));
vi.mock("src/modals", () => ({
	showAccessListModal: (...a: any[]) => mocks.modal("access", ...a), showCustomCertificateModal: (...a: any[]) => mocks.modal("custom-cert", ...a),
	showDeadHostModal: (...a: any[]) => mocks.modal("dead", ...a), showDeleteConfirmModal: (...a: any[]) => mocks.modal("delete", ...a),
	showDNSCertificateModal: (...a: any[]) => mocks.modal("dns-cert", ...a), showEventDetailsModal: (...a: any[]) => mocks.modal("event", ...a),
	showHelpModal: (...a: any[]) => mocks.modal("help", ...a), showHTTPCertificateModal: (...a: any[]) => mocks.modal("http-cert", ...a),
	showNginxLogViewerModal: (...a: any[]) => mocks.modal("logs", ...a), showPermissionsModal: (...a: any[]) => mocks.modal("permissions", ...a),
	showProxyHostModal: (...a: any[]) => mocks.modal("proxy", ...a), showProxyHostMonitoringModal: (...a: any[]) => mocks.modal("monitor", ...a),
	showRedirectionHostModal: (...a: any[]) => mocks.modal("redirect", ...a), showRenewCertificateModal: (...a: any[]) => mocks.modal("renew", ...a),
	showSetPasswordModal: (...a: any[]) => mocks.modal("password", ...a), showStreamModal: (...a: any[]) => mocks.modal("stream", ...a),
	showUserModal: (...a: any[]) => mocks.modal("user", ...a),
}));
vi.mock("src/api/backend", () => ({
	deleteAccessList: (...a: any[]) => mocks.api("deleteAccess", ...a), deleteCertificate: (...a: any[]) => mocks.api("deleteCertificate", ...a),
	downloadCertificate: (...a: any[]) => mocks.api("downloadCertificate", ...a), deleteDeadHost: (...a: any[]) => mocks.api("deleteDead", ...a),
	toggleDeadHost: (...a: any[]) => mocks.api("toggleDead", ...a), deleteProxyHost: (...a: any[]) => mocks.api("deleteProxy", ...a),
	toggleProxyHost: (...a: any[]) => mocks.api("toggleProxy", ...a), deleteRedirectionHost: (...a: any[]) => mocks.api("deleteRedirect", ...a),
	toggleRedirectionHost: (...a: any[]) => mocks.api("toggleRedirect", ...a), deleteStream: (...a: any[]) => mocks.api("deleteStream", ...a),
	toggleStream: (...a: any[]) => mocks.api("toggleStream", ...a), deleteUser: (...a: any[]) => mocks.api("deleteUser", ...a),
	toggleUser: (...a: any[]) => mocks.api("toggleUser", ...a),
}));

const result = (data: any[]) => ({ data, isFetching: false, isLoading: false, isError: false, error: null, refetch: mocks.refetch });
vi.mock("src/hooks", () => ({
	useAccessLists: () => result([{ id: 1, name: "Private", items: [], clients: [] }]),
	useAuditLogs: () => result([{ id: 1, action: "created" }]),
	useCertificates: () => result([{ id: 1, niceName: "Wildcard", domainNames: ["example.test"] }]),
	useDeadHosts: () => result([{ id: 1, domainNames: ["dead.test"], enabled: true }]),
	useProxyHosts: () => result([{ id: 1, domainNames: ["proxy.test"], forwardScheme: "http", forwardHost: "127.0.0.1", forwardPort: 80, enabled: true, defaultTarget: { type: "direct" }, nginxConfig: { listener: { mode: "domain" } } }]),
	useRedirectionHosts: () => result([{ id: 1, domainNames: ["redirect.test"], forwardDomainName: "target.test", enabled: true }]),
	useStreams: () => result([{ id: 1, incomingPort: 1234, forwardingHost: "127.0.0.1", forwardingPort: 4321, enabled: true }]),
	useUpstreams: () => ({ data: [{ id: 9, name: "Backend", nginxKey: "backend" }] }),
	useUser: () => ({ data: { id: 99 } }),
	useUsers: () => result([{ id: 1, name: "Alice", nickname: "ali", email: "alice@example.test", isDisabled: false }]),
}));

vi.mock("./Access/Table", () => ({ default: (props: any) => { mocks.props.access = props; return <div data-testid="access-table" />; } }));
vi.mock("./AuditLog/Table", () => ({ default: (props: any) => { mocks.props.audit = props; return <div data-testid="audit-table" />; } }));
vi.mock("./Certificates/Table", () => ({ default: (props: any) => { mocks.props.certificates = props; return <div data-testid="certificates-table" />; } }));
vi.mock("./Nginx/DeadHosts/Table", () => ({ default: (props: any) => { mocks.props.dead = props; return <div data-testid="dead-table" />; } }));
vi.mock("./Nginx/ProxyHosts/Table", () => ({ default: (props: any) => { mocks.props.proxy = props; return <div data-testid="proxy-table" />; } }));
vi.mock("./Nginx/RedirectionHosts/Table", () => ({ default: (props: any) => { mocks.props.redirect = props; return <div data-testid="redirect-table" />; } }));
vi.mock("./Nginx/Streams/Table", () => ({ default: (props: any) => { mocks.props.stream = props; return <div data-testid="stream-table" />; } }));
vi.mock("./Users/Table", () => ({ default: (props: any) => { mocks.props.users = props; return <div data-testid="users-table" />; } }));

import Access from "./Access/TableWrapper";
import Audit from "./AuditLog/TableWrapper";
import Certificates from "./Certificates/TableWrapper";
import DeadHosts from "./Nginx/DeadHosts/TableWrapper";
import ProxyHosts from "./Nginx/ProxyHosts/TableWrapper";
import RedirectionHosts from "./Nginx/RedirectionHosts/TableWrapper";
import Streams from "./Nginx/Streams/TableWrapper";
import Users from "./Users/TableWrapper";

afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.props = {}; mocks.api.mockResolvedValue({}); });

const search = (value: string) => fireEvent.change(document.getElementById("advanced-table-search")!, { target: { value } });
const deleteOptions = () => [...mocks.modal.mock.calls].reverse().find((call: any[]) => call[0] === "delete")?.[1];

describe("list table wrappers", () => {
	it("covers access and audit actions", async () => {
		render(<Access />); search("private"); expect(mocks.props.access.data).toHaveLength(1);
		mocks.props.access.onEdit(1); mocks.props.access.onNew(); mocks.props.access.onDelete(1); await deleteOptions().onConfirm();
		expect(mocks.api).toHaveBeenCalledWith("deleteAccess", 1); cleanup();
		render(<Audit />); mocks.props.audit.onSelectItem(1); expect(mocks.modal).toHaveBeenCalledWith("event", 1);
	});

	it("covers certificate actions and creation choices", async () => {
		render(<Certificates />); search("example");
		for (const link of screen.getAllByRole("link")) fireEvent.click(link);
		mocks.props.certificates.onRenew(1); await mocks.props.certificates.onDownload(1);
		mocks.props.certificates.onDelete(1); await deleteOptions().onConfirm();
		expect(mocks.api).toHaveBeenCalledWith("downloadCertificate", 1);
	});

	it.each([
		["dead", DeadHosts, "dead.test"], ["redirect", RedirectionHosts, "redirect.test"], ["stream", Streams, "1234"],
	] as const)("covers %s host list callbacks", async (key, Component, term) => {
		render(<Component />); search(term);
		const props = mocks.props[key]; props.onEdit(1); props.onNew(); props.onLogs(1); await props.onDisableToggle(1, false);
		props.onDelete(1); await deleteOptions().onConfirm();
		expect(mocks.api).toHaveBeenCalled();
	});

	it("covers proxy host refresh, monitoring, logs, deletion and toggle", async () => {
		render(<ProxyHosts />); search("proxy.test");
		const props = mocks.props.proxy; props.onEdit(1); props.onNew(); props.onMonitoring(1); props.onLogs(1);
		await props.onDisableToggle(1, true); props.onDelete(1); await deleteOptions().onConfirm();
		fireEvent.click(screen.getByRole("button", { name: "Refresh list" }));
		expect(mocks.refetch).toHaveBeenCalled();
	});

	it("covers user administration callbacks", async () => {
		render(<Users />); search("alice");
		const props = mocks.props.users; props.onEditUser(1); props.onEditPermissions(1); props.onSetPassword(1); props.onNewUser();
		await props.onDisableToggle(1, false); await props.onLoginAs(1); props.onDeleteUser(1); await deleteOptions().onConfirm();
		expect(mocks.loginAs).toHaveBeenCalledWith(1);
	});
});
