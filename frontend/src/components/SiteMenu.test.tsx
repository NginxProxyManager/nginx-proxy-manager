import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RawIntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createIntl } from "src/locale";
import { SiteMenu } from "./SiteMenu";

const state = vi.hoisted(() => ({ capabilities: [] as string[] }));
vi.mock("src/hooks", () => ({ useUser: () => ({ data: { capabilities: state.capabilities }, isLoading: false }) }));
const intl = createIntl({ locale: "en", messages: { dashboard: "Dashboard", hosts: "Hosts", users: "Users", settings: "Settings", auditlogs: "Audit", logs: "Logs", "proxy-hosts": "Proxy", "redirection-hosts": "Redirection", streams: "Streams", "dead-hosts": "Dead", "access-lists": "Access", certificates: "Certificates" } });
function renderMenu() { return render(<MemoryRouter><RawIntlProvider value={intl}><SiteMenu /></RawIntlProvider></MemoryRouter>); }

describe("SiteMenu capability visibility", () => {
	afterEach(cleanup);
	it("shows users.manage without leaking Settings or empty Hosts", () => {
		state.capabilities = ["users.manage"];
		renderMenu();
		expect(screen.getByText("Users")).toBeVisible();
		expect(screen.queryByText("Settings")).not.toBeInTheDocument();
		expect(screen.queryByText("Hosts")).not.toBeInTheDocument();
	});
	it("lets full-admin see all guarded navigation", () => {
		state.capabilities = ["full-admin"];
		renderMenu();
		expect(screen.getByText("Users")).toBeVisible();
		expect(screen.getByText("Settings")).toBeVisible();
		expect(screen.getByText("Hosts")).toBeVisible();
	});
});
