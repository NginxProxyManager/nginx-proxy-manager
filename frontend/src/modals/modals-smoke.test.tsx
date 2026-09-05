import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement, type ButtonHTMLAttributes, type ComponentType, type PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ show: vi.fn(), remove: vi.fn(), mutate: vi.fn(), get2FAStatus: vi.fn(), disable2FA: vi.fn(), regenerateBackupCodes: vi.fn(), testHttpCertificate: vi.fn() }));
vi.mock("ez-modal-react", () => ({ default: { create: (component: unknown) => component, show: mocks.show } }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("src/locale", () => ({
	getLocale: () => "en",
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => <>{id}</>,
}));
vi.mock("src/notifications", () => ({ showError: vi.fn(), showObjectSuccess: vi.fn() }));
vi.mock("src/components", () => {
	const Stub = ({ children }: PropsWithChildren) => <div>{children}</div>;
	const Button = ({ children, actionType: _actionType, isLoading: _isLoading, ...props }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { actionType?: string; isLoading?: boolean }>) => <button {...props}>{children}</button>;
	return {
		AccessClientFields: Stub, BasicAuthFields: Stub, Button, DNSProviderFields: Stub,
		DomainNamesField: ({ onChange }: { onChange?: (domains: string[]) => void }) => <button type="button" onClick={() => onChange?.(["example.test"])}>choose-domain</button>,
		EventFormatter: ({ value }: { value?: unknown }) => <span>{String(value ?? "event")}</span>,
		GravatarFormatter: () => <span>avatar</span>, Loading: () => <span>loading</span>, NginxConfigField: Stub,
		SSLCertificateField: Stub, SSLOptionsFields: Stub,
	};
});
vi.mock("src/locale/src/HelpDoc", () => ({ getHelpFile: () => "/help.md" }));
vi.mock("src/api/backend", () => ({
	createCertificate: vi.fn().mockResolvedValue({ id: 1 }), disable2FA: (...args: any[]) => mocks.disable2FA(...args),
	enable2FA: vi.fn().mockResolvedValue({ backupCodes: ["one"] }), get2FAStatus: (...args: any[]) => mocks.get2FAStatus(...args),
	getNginxHostLog: vi.fn().mockResolvedValue({ content: "", cursor: "0", file: { exists: true } }),
	regenerateBackupCodes: (...args: any[]) => mocks.regenerateBackupCodes(...args), renewCertificate: vi.fn().mockResolvedValue({}),
	setPermissions: vi.fn().mockResolvedValue({}), start2FASetup: vi.fn().mockResolvedValue({ secret: "secret", otpauthUrl: "otpauth://test" }),
	testHttpCertificate: (...args: any[]) => mocks.testHttpCertificate(...args), updateAuth: vi.fn().mockResolvedValue({}), uploadCertificate: vi.fn().mockResolvedValue({}),
	validateCertificate: vi.fn().mockResolvedValue({ certificate: {}, certificateKey: {} }),
}));
vi.mock("src/hooks", () => ({
	useAccessList: () => ({ data: { name: "List", satisfyAny: false, passAuth: false, items: [{ username: "alice", password: "secret" }], clients: [] }, isLoading: false, error: null }), useSetAccessList: () => ({ mutate: mocks.mutate }),
	useAuditLog: () => ({ data: { id: 1, action: "created", objectType: "proxy-host", objectId: 2, meta: {}, user: { name: "Admin" } }, isLoading: false, error: null }),
	useCertificate: () => ({ data: { id: 1, niceName: "Example", domainNames: ["example.test"] }, isLoading: false, error: null }),
	useDeadHost: () => ({ data: { domainNames: [], certificateId: 0, sslForced: false, advancedConfig: "", meta: {} }, isLoading: false, error: null }), useSetDeadHost: () => ({ mutate: mocks.mutate }),
	useRedirectionHost: () => ({ data: { domainNames: [], forwardScheme: "http", forwardDomainName: "", preservePath: true, blockExploits: false, certificateId: 0, meta: {} }, isLoading: false, error: null }), useSetRedirectionHost: () => ({ mutate: mocks.mutate }),
	useSetStream: () => ({ mutate: mocks.mutate }), useStream: () => ({ data: { incomingPort: 1234, forwardingHost: "", forwardingPort: 80, tcpForwarding: true, udpForwarding: false, certificateId: 0, meta: {} }, isLoading: false, error: null }),
	useSetUpstream: () => ({ mutate: mocks.mutate }), useUpstream: () => ({ data: undefined, isLoading: false, error: null }),
	useSetUser: () => ({ mutate: mocks.mutate }), useUser: (id: unknown) => ({ data: id === "new" ? { name: "", nickname: "", email: "", roles: [] } : { id: 1, name: "Operator", nickname: "Ops", email: "ops@example.test", isAdmin: false, roles: [], permissions: { visibility: "user", accessLists: "view", certificates: "manage", deadHosts: "hidden", proxyHosts: "manage", redirectionHosts: "view", streams: "manage", upstreams: "view" } }, isLoading: false, error: null }),
}));

import { showAccessListModal } from "./AccessListModal";
import { showChangePasswordModal } from "./ChangePasswordModal";
import { showCustomCertificateModal } from "./CustomCertificateModal";
import { showDeadHostModal } from "./DeadHostModal";
import { showDeleteConfirmModal } from "./DeleteConfirmModal";
import { showDNSCertificateModal } from "./DNSCertificateModal";
import { showEventDetailsModal } from "./EventDetailsModal";
import { showHelpModal } from "./HelpModal";
import { showHTTPCertificateModal } from "./HTTPCertificateModal";
import { showPermissionsModal } from "./PermissionsModal";
import { showRedirectionHostModal } from "./RedirectionHostModal";
import { showRenewCertificateModal } from "./RenewCertificateModal";
import { showSetPasswordModal } from "./SetPasswordModal";
import { showStreamModal } from "./StreamModal";
import { showTwoFactorModal } from "./TwoFactorModal";
import { showUpstreamModal } from "./UpstreamModal";
import { showUserModal } from "./UserModal";

afterEach(cleanup);
beforeEach(() => {
	vi.clearAllMocks();
	mocks.mutate.mockImplementation((_payload, options) => { options?.onSuccess?.({}); options?.onSettled?.(); });
	mocks.get2FAStatus.mockResolvedValue({ enabled: false, backupCodesRemaining: 0 });
	mocks.disable2FA.mockResolvedValue({});
	mocks.regenerateBackupCodes.mockResolvedValue({ backupCodes: ["new-code"] });
	mocks.testHttpCertificate.mockResolvedValue({});
	vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ text: async () => "# Help" }));
});

const renderShown = (show: (...args: any[]) => unknown, ...args: any[]) => {
	show(...args);
	const [Component, props] = mocks.show.mock.calls[mocks.show.mock.calls.length - 1] as [ComponentType<any>, Record<string, unknown>];
	return render(createElement(Component, { ...props, visible: true, remove: mocks.remove, hide: vi.fn(), resolve: vi.fn(), reject: vi.fn() }));
};

describe("modal smoke coverage", () => {
	it("renders host and upstream editors for new records", () => {
		renderShown(showAccessListModal, "new"); expect(screen.getByRole("dialog")).toBeInTheDocument(); cleanup();
		renderShown(showDeadHostModal, "new"); expect(screen.getByRole("dialog")).toBeInTheDocument(); cleanup();
		renderShown(showRedirectionHostModal, "new"); expect(screen.getByRole("dialog")).toBeInTheDocument(); cleanup();
		renderShown(showStreamModal, "new"); expect(screen.getByRole("dialog")).toBeInTheDocument(); cleanup();
		renderShown(showUpstreamModal, "new"); expect(screen.getByRole("dialog")).toBeInTheDocument();
	});

	it("renders user, password, permissions, delete, and event dialogs", () => {
		renderShown(showUserModal, "new"); expect(screen.getByRole("dialog")).toBeInTheDocument(); cleanup();
		renderShown(showChangePasswordModal, "me"); expect(screen.getByRole("dialog")).toBeInTheDocument(); cleanup();
		renderShown(showSetPasswordModal, 1); expect(screen.getByRole("dialog")).toBeInTheDocument(); cleanup();
		renderShown(showPermissionsModal, 1); expect(screen.getByRole("dialog")).toBeInTheDocument(); cleanup();
		renderShown(showDeleteConfirmModal, { tTitle: "delete.title", children: <span>target</span>, onConfirm: vi.fn() }); expect(screen.getByText("target")).toBeInTheDocument(); cleanup();
		renderShown(showEventDetailsModal, 1); expect(screen.getByRole("dialog")).toBeInTheDocument();
	});

	it("renders certificate workflows", () => {
		renderShown(showCustomCertificateModal); expect(screen.getByRole("dialog")).toBeInTheDocument(); cleanup();
		renderShown(showDNSCertificateModal); expect(screen.getByRole("dialog")).toBeInTheDocument(); cleanup();
		renderShown(showHTTPCertificateModal); expect(screen.getByRole("dialog")).toBeInTheDocument(); cleanup();
		renderShown(showRenewCertificateModal, 1); expect(screen.getByRole("dialog")).toBeInTheDocument();
	});

	it("loads two-factor status and help content", async () => {
		renderShown(showTwoFactorModal, "me");
		await waitFor(() => expect(screen.getByText("2fa.title")).toBeInTheDocument());
		cleanup();
		renderShown(showHelpModal, "proxy-host", "lime");
		await waitFor(() => expect(screen.getByText("Help")).toBeInTheDocument());
	});

	it("submits access, host, upstream, user, password, and permission forms", async () => {
		for (const [show, args] of [
			[showAccessListModal, ["new"]], [showDeadHostModal, ["new"]], [showRedirectionHostModal, ["new"]],
			[showStreamModal, ["new"]], [showUpstreamModal, ["new"]], [showUserModal, ["new"]], [showPermissionsModal, [1]],
		] as Array<[any, any[]]>) {
			renderShown(show, ...args);
			for (const input of Array.from(document.querySelectorAll<HTMLInputElement>("input:not([type=file]):not([type=checkbox]):not([type=radio])"))) {
				fireEvent.change(input, { target: { value: input.type === "number" ? "8080" : input.type === "email" ? "user@example.test" : "value" } });
			}
			const save = screen.queryByRole("button", { name: "save" });
			if (save) fireEvent.click(save);
			await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
			cleanup();
		}
		expect(mocks.mutate).toHaveBeenCalled();

		renderShown(showChangePasswordModal, "me");
		fireEvent.change(document.getElementById("current")!, { target: { value: "old-password" } });
		fireEvent.change(document.getElementById("new")!, { target: { value: "new-password" } });
		fireEvent.change(document.getElementById("confirm")!, { target: { value: "new-password" } });
		fireEvent.click(screen.getByRole("button", { name: "save" }));
		await waitFor(() => expect(mocks.remove).toHaveBeenCalled());
		cleanup();

		renderShown(showSetPasswordModal, 1);
		for (const input of screen.getAllByDisplayValue("")) fireEvent.change(input, { target: { value: "new-password" } });
		fireEvent.click(screen.getByRole("button", { name: "save" }));
		await waitFor(() => expect(mocks.remove).toHaveBeenCalled());
	});

	it("tests and submits HTTP certificates and completes two-factor setup", async () => {
		renderShown(showHTTPCertificateModal);
		fireEvent.click(screen.getByRole("button", { name: "choose-domain" }));
		fireEvent.click(screen.getByRole("button", { name: "test" }));
		await waitFor(() => expect(screen.getByText("certificates.http.test-results")).toBeInTheDocument());
		fireEvent.click(screen.getByRole("button", { name: "save" }));
		await waitFor(() => expect(mocks.remove).toHaveBeenCalled());
		cleanup();

		renderShown(showTwoFactorModal, "me");
		await waitFor(() => expect(screen.getByRole("button", { name: "2fa.enable" })).toBeInTheDocument());
		fireEvent.click(screen.getByRole("button", { name: "2fa.enable" }));
		await waitFor(() => expect(screen.getByRole("button", { name: "2fa.verify-enable" })).toBeInTheDocument());
		fireEvent.change(screen.getByPlaceholderText("000000"), { target: { value: "123456" } });
		fireEvent.click(screen.getByRole("button", { name: "2fa.verify-enable" }));
		await waitFor(() => expect(screen.getByRole("button", { name: "2fa.done" })).toBeInTheDocument());
		fireEvent.click(screen.getByRole("button", { name: "2fa.done" }));
	});

	it("uploads custom certificates and exercises enabled two-factor actions", async () => {
		renderShown(showCustomCertificateModal);
		fireEvent.change(document.getElementById("niceName")!, { target: { value: "Imported" } });
		const certificate = new File(["certificate"], "cert.pem", { type: "text/plain" });
		const key = new File(["key"], "key.pem", { type: "text/plain" });
		fireEvent.change(document.getElementById("certificate")!, { target: { files: [certificate] } });
		fireEvent.change(document.getElementById("certificateKey")!, { target: { files: [key] } });
		await new Promise((resolve) => setTimeout(resolve, 0));
		fireEvent.submit(document.querySelector("form")!);
		await waitFor(() => expect(mocks.remove).toHaveBeenCalled());
		cleanup();

		mocks.get2FAStatus.mockResolvedValue({ enabled: true, backupCodesRemaining: 4 });
		renderShown(showTwoFactorModal, "me");
		await waitFor(() => expect(screen.getByRole("button", { name: "2fa.disable" })).toBeInTheDocument());
		fireEvent.click(screen.getByRole("button", { name: "2fa.regenerate-backup" }));
		fireEvent.change(screen.getByPlaceholderText("000000"), { target: { value: "654321" } });
		fireEvent.click(screen.getByRole("button", { name: "2fa.regenerate" }));
		await waitFor(() => expect(screen.getByText("new-code")).toBeInTheDocument());
		fireEvent.click(screen.getByRole("button", { name: "2fa.done" }));
		await waitFor(() => expect(screen.getByRole("button", { name: "2fa.disable" })).toBeInTheDocument());
		fireEvent.click(screen.getByRole("button", { name: "2fa.disable" }));
		fireEvent.change(screen.getByPlaceholderText("000000"), { target: { value: "123456" } });
		fireEvent.click(screen.getByRole("button", { name: "2fa.disable-confirm" }));
		await waitFor(() => expect(mocks.disable2FA).toHaveBeenCalledWith("me", "123456"));
	});

	it("submits DNS certificates and handles delete confirmations", async () => {
		renderShown(showDNSCertificateModal);
		fireEvent.submit(document.querySelector("form")!);
		await waitFor(() => expect(mocks.remove).toHaveBeenCalled());
		cleanup();

		const confirm = vi.fn().mockResolvedValue(undefined);
		renderShown(showDeleteConfirmModal, { tTitle: "delete.title", children: <span>record</span>, onConfirm: confirm, invalidations: [["records"]] });
		fireEvent.click(screen.getByRole("button", { name: "action.delete" }));
		await waitFor(() => expect(confirm).toHaveBeenCalled());
		expect(mocks.remove).toHaveBeenCalled();
		cleanup();

		renderShown(showDeleteConfirmModal, { title: <span>Delete</span>, children: <span>record</span>, onConfirm: vi.fn().mockRejectedValue(new Error("delete failed")) });
		fireEvent.click(screen.getByRole("button", { name: "action.delete" }));
		expect(await screen.findByText("delete failed")).toBeInTheDocument();
	});

	it("generates and reveals a password", async () => {
		renderShown(showSetPasswordModal, 1);
		fireEvent.click(screen.getByText("password.generate"));
		expect(document.querySelector("input")?.type).toBe("text");
		fireEvent.click(screen.getByText("password.hide"));
		expect(document.querySelector("input")?.type).toBe("password");
	});

	it("renders every HTTP reachability result and edits upstream servers", async () => {
		mocks.testHttpCertificate.mockResolvedValue({
			"ok.test": "ok", "missing.test": "no-host", "failed.test": "failed", "notfound.test": "404",
			"wrong.test": "wrong-data", "other.test": "other:503", "unknown.test": "unexpected",
		});
		renderShown(showHTTPCertificateModal);
		fireEvent.click(screen.getByRole("button", { name: "choose-domain" }));
		fireEvent.click(screen.getByRole("button", { name: "test" }));
		await waitFor(() => expect(screen.getByText("certificates.http.reachability-ok")).toBeInTheDocument());
		expect(screen.getByText("certificates.http.reachability-not-resolved")).toBeInTheDocument();
		expect(screen.getByText("certificates.http.reachability-failed-to-check")).toBeInTheDocument();
		expect(screen.getByText("certificates.http.reachability-404")).toBeInTheDocument();
		expect(screen.getByText("certificates.http.reachability-wrong-data")).toBeInTheDocument();
		expect(screen.getByText("certificates.http.reachability-other")).toBeInTheDocument();
		cleanup();

		renderShown(showUpstreamModal, "new");
		fireEvent.click(screen.getByRole("button", { name: "upstreams.server.add" }));
		expect(screen.getAllByText("upstreams.server.title")).toHaveLength(2);
		const removeButtons = screen.getAllByRole("button", { name: "upstreams.server.remove" });
		fireEvent.click(removeButtons[removeButtons.length - 1]);
		for (const checkbox of screen.getAllByRole("checkbox")) fireEvent.click(checkbox);
	});

	it("changes every non-admin permission option", () => {
		renderShown(showPermissionsModal, 1);
		const radios = screen.getAllByRole("radio");
		expect(radios.length).toBeGreaterThan(10);
		for (const radio of radios) fireEvent.click(radio);
		fireEvent.submit(document.querySelector("form")!);
	});
});
