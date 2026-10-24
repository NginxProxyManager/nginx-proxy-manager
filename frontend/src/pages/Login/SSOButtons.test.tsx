import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RawIntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createIntl } from "src/locale";
import SSOButtons from "./SSOButtons";

const intl = createIntl({
	locale: "en",
	messages: { "login.sso-administrator-password": "Administrator password login" },
});

const providers = {
	mode: "parallel" as const,
	passwordLoginAvailable: true,
	connections: [
		{ id: "corp oidc", name: "Corporate <script>alert(1)</script>", protocol: "oidc" as const },
		{ id: "partners", name: "Partners", protocol: "saml" as const },
	],
};

afterEach(cleanup);

describe("SSO login choices", () => {
	it("renders named providers as safe full-page links without auto-navigation", () => {
		const onPassword = vi.fn();
		render(<RawIntlProvider value={intl}><SSOButtons providers={providers} onAdministratorPassword={onPassword} /></RawIntlProvider>);
		expect(screen.getByText("Corporate <script>alert(1)</script>")).toBeVisible();
		expect(document.querySelector("script")).toBeNull();
		expect(screen.getByRole("link", { name: /corporate/i })).toHaveAttribute("href", "/sso/corp%20oidc/start");
		expect(window.location.pathname).not.toContain("/sso/");
		expect(screen.queryByRole("button", { name: /administrator password/i })).not.toBeInTheDocument();
	});

	it("keeps the administrator password entry discoverable in SSO-only mode", () => {
		const onPassword = vi.fn();
		render(<RawIntlProvider value={intl}><SSOButtons providers={{ ...providers, mode: "sso_only" }} onAdministratorPassword={onPassword} /></RawIntlProvider>);
		fireEvent.click(screen.getByRole("button", { name: /administrator password/i }));
		expect(onPassword).toHaveBeenCalledOnce();
	});

	it("keeps the administrator recovery entry when no provider is currently usable", () => {
		const onPassword = vi.fn();
		render(<RawIntlProvider value={intl}><SSOButtons providers={{ ...providers, mode: "sso_only", connections: [] }} onAdministratorPassword={onPassword} /></RawIntlProvider>);
		expect(screen.getByRole("button", { name: /administrator password/i })).toBeVisible();
	});
});
