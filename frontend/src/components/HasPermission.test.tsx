import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RawIntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createIntl } from "src/locale";
import { HOSTS, SETTINGS, VIEW } from "src/modules/Permissions";
import { HasPermission } from "./HasPermission";

const state = vi.hoisted(() => ({ capabilities: [] as string[] }));
vi.mock("src/hooks", () => ({ useUser: () => ({ data: { capabilities: state.capabilities }, isLoading: false }) }));
const intl = createIntl({ locale: "en", messages: { "no-permission-error": "No permission" } });

function subject(section: typeof HOSTS | typeof SETTINGS) {
	return render(<RawIntlProvider value={intl}><HasPermission section={section} permission={VIEW} hideError><span>Allowed</span></HasPermission></RawIntlProvider>);
}

describe("HasPermission", () => {
	afterEach(cleanup);
	it("distinguishes zero, exact view, manage-only and full-admin", () => {
		for (const [capabilities, allowed] of [[[], false], [["hosts.view"], true], [["hosts.manage"], false], [["full-admin"], true]] as [string[], boolean][]) {
			state.capabilities = capabilities;
			const view = subject(HOSTS);
			expect(screen.queryByText("Allowed") !== null).toBe(allowed);
			view.unmount();
		}
	});
	it("does not give a users manager Settings access", () => {
		state.capabilities = ["users.manage"];
		subject(SETTINGS);
		expect(screen.queryByText("Allowed")).not.toBeInTheDocument();
	});
});
