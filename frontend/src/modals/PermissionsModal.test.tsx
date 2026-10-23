import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RawIntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createIntl } from "src/locale";
import { PermissionsEditor } from "./PermissionsModal";

const state = vi.hoisted(() => ({ update: vi.fn(), targetCaps: ["hosts.view"], selfCaps: ["users.manage"], selfId: 1 }));
vi.mock("src/api/backend", async (original) => ({ ...(await original()), updateUser: state.update }));
vi.mock("src/hooks", async (original) => ({ ...(await original()), useUser: () => ({ data: { id: 2, name: "Target", capabilities: state.targetCaps }, isLoading: false }), useCurrentUser: () => ({ data: { id: state.selfId, capabilities: state.selfCaps } }) }));

const intl = createIntl({ locale: "en", messages: { "user.set-permissions": "Permissions", "permissions.capabilities": "Capabilities", "permissions.view": "View", "permissions.manage": "Manage", "role.admin": "Administrator", save: "Save", cancel: "Cancel", hosts: "Hosts", streams: "Streams", "access-lists": "Access Lists", certificates: "Certificates", auditlogs: "Audit", settings: "Settings", users: "Users", "permissions.certificate-authorities": "Certificate authorities", "permissions.dns-providers": "DNS providers", "permissions.nginx-templates": "Nginx templates" } });

function renderEditor() { return render(<QueryClientProvider client={new QueryClient()}><RawIntlProvider value={intl}><PermissionsEditor {...({ id: 2, visible: true, remove: vi.fn() } as any)} /></RawIntlProvider></QueryClientProvider>); }

describe("PermissionsEditor", () => {
	beforeEach(() => { state.update.mockReset().mockResolvedValue({ id: 2 }); state.targetCaps = ["hosts.view"]; state.selfCaps = ["users.manage"]; state.selfId = 1; });
	afterEach(cleanup);
	it("saves and clears exact backend capabilities without granting settings", async () => {
		renderEditor();
		fireEvent.click(screen.getByLabelText("hosts view"));
		fireEvent.click(screen.getByLabelText("users manage"));
		fireEvent.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(state.update).toHaveBeenCalledWith({ id: 2, capabilities: ["users.manage"] }));
		expect(state.update.mock.calls[0][0].capabilities).not.toContain("settings.manage");
	});

	it("does not allow a full administrator to remove its own full-admin capability", () => {
		state.selfId = 2;
		state.targetCaps = ["full-admin"];
		renderEditor();
		expect(screen.getByLabelText("Administrator")).toBeDisabled();
	});
});
