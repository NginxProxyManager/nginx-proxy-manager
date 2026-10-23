import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { RawIntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createIntl } from "src/locale";
import SSOSettings from ".";

const { state } = vi.hoisted(() => ({
	state: {
		policy: { mode: "parallel", publicUrl: "https://npm.example.test", revision: 4 },
		allowlist: { revision: 4, emails: ["admin@example.test"] },
		connections: [
			{
				id: "oidc-one",
				protocol: "oidc",
				name: "Company OIDC",
				enabled: true,
				revision: 2,
				hasSecret: true,
				config: {
					issuerUrl: "https://idp.example.test",
					clientId: "npm",
					emailClaim: "email",
					nameClaim: "name",
					scopes: ["openid", "email"],
					useUserinfo: false,
					tokenAuthMethod: "client_secret_basic",
				},
			},
			{
				id: "saml-one",
				protocol: "saml",
				name: "Partner SAML",
				enabled: false,
				revision: 1,
				hasSecret: true,
				config: {
					idpMetadataUrl: "https://idp.example.test/metadata",
					spEntityId: "https://npm.example.test/saml",
					emailAttribute: "mail",
					signRequests: true,
				},
			},
		],
		legacyStatus: { conversionAvailable: true },
		queryError: null as Error | null,
		updatePolicy: vi.fn(),
		updateAllowlist: vi.fn(),
		saveConnection: vi.fn(),
		deleteConnection: vi.fn(),
		testConnection: vi.fn(),
		previewSAML: vi.fn(),
		importLegacy: vi.fn(),
		refetchAll: vi.fn(),
	},
}));

vi.mock("src/hooks/useSSO", () => ({
	useSSOSettings: () => ({
		policy: { data: state.policy, isLoading: false, error: state.queryError },
		allowlist: { data: state.allowlist, isLoading: false, error: null },
		connections: { data: state.connections, isLoading: false, error: null },
		legacyStatus: { data: state.legacyStatus, isLoading: false, error: null },
		updatePolicy: { mutateAsync: state.updatePolicy, isPending: false },
		updateAllowlist: { mutateAsync: state.updateAllowlist, isPending: false },
		saveConnection: { mutateAsync: state.saveConnection, isPending: false },
		deleteConnection: { mutateAsync: state.deleteConnection, isPending: false },
		testConnection: { mutateAsync: state.testConnection, isPending: false },
		previewSAML: { mutateAsync: state.previewSAML, isPending: false },
		importLegacy: { mutateAsync: state.importLegacy, isPending: false },
		refetchAll: state.refetchAll,
	}),
}));

const intl = createIntl({
	locale: "en",
	messages: {
		"settings.sso.title": "Single sign-on",
		"settings.sso.policy": "Login policy",
		"settings.sso.connections": "Connections",
		"settings.sso.allowlist": "Trusted emails",
		"settings.sso.save": "Save",
		"settings.sso.test": "Test saved connection",
		"settings.sso.add": "Add connection",
		"settings.sso.delete": "Remove connection",
		"settings.sso.preview": "Preview metadata",
		"settings.sso.importLegacy": "Import legacy OAuth",
		"settings.sso.secretConfigured": "A client secret is stored securely.",
		"settings.sso.secretKeep": "Keep saved secret",
		"settings.sso.secretReplace": "Replace secret",
		"settings.sso.secretClear": "Clear secret",
		"settings.sso.emailInvalid": "Enter one complete email address per line.",
		"settings.sso.revisionConflict": "This configuration changed. Reloaded the latest version.",
		"settings.sso.directLinkWarning":
			"Any enabled connection can sign in as a trusted email and links directly to an existing account.",
		"settings.sso.pendingWarning": "New accounts wait for an administrator to grant permissions.",
		"settings.sso.metadataReviewed": "Reviewed identity provider metadata",
		"settings.sso.callbackUrl": "Callback URL",
		"settings.sso.acsUrl": "ACS URL",
		"settings.sso.metadataUrl": "SP metadata URL",
		"settings.sso.publicCertificate": "SP public certificate",
		"settings.sso.enabled": "Enabled",
		"settings.sso.name": "Display name",
		"settings.sso.protocol": "Protocol",
		"settings.sso.mode": "Login mode",
		"settings.sso.publicUrl": "Public administration URL",
		"settings.sso.parallel": "Password and SSO",
		"settings.sso.ssoOnly": "SSO only",
		"settings.sso.emails": "Email addresses",
		"settings.sso.issuerUrl": "Issuer URL",
		"settings.sso.clientId": "Client ID",
		"settings.sso.clientSecret": "Client secret",
		"settings.sso.authorizationUrl": "Authorization URL",
		"settings.sso.tokenUrl": "Token URL",
		"settings.sso.userinfoUrl": "UserInfo URL",
		"settings.sso.emailClaim": "Email claim",
		"settings.sso.subjectClaim": "Subject claim",
		"settings.sso.nameClaim": "Name claim",
		"settings.sso.scopes": "Scopes",
		"settings.sso.tokenAuthMethod": "Token authentication",
		"settings.sso.useUserinfo": "Read identity from UserInfo",
		"settings.sso.idpMetadataUrl": "IdP metadata URL",
		"settings.sso.idpMetadataXml": "IdP metadata XML",
		"settings.sso.spEntityId": "SP entity ID",
		"settings.sso.emailAttribute": "Email attribute",
		"settings.sso.emailNameId": "Use email-format NameID",
		"settings.sso.nameAttribute": "Name attribute",
		"settings.sso.signRequests": "Sign authentication requests",
	},
});

function renderPage() {
	return render(
		<RawIntlProvider value={intl}>
			<SSOSettings />
		</RawIntlProvider>,
	);
}

describe("SSO settings", () => {
	beforeEach(() => {
		state.queryError = null;
		for (const mock of [
			state.updatePolicy,
			state.updateAllowlist,
			state.saveConnection,
			state.deleteConnection,
			state.testConnection,
			state.previewSAML,
			state.importLegacy,
			state.refetchAll,
		]) {
			mock.mockReset();
			mock.mockResolvedValue(undefined);
		}
	});

	afterEach(cleanup);

	it("shows every saved connection and explains shared direct email linking", () => {
		renderPage();
		expect(screen.getByText("Company OIDC")).toBeVisible();
		expect(screen.getByText("Partner SAML")).toBeVisible();
		expect(screen.getByText(/links directly to an existing account/i)).toBeVisible();
		expect(screen.getByText(/wait for an administrator/i)).toBeVisible();
	});

	it("keeps a stored client secret masked and unchanged unless replace or clear is explicit", async () => {
		renderPage();
		fireEvent.click(screen.getByText("Company OIDC"));

		expect(screen.getByText("A client secret is stored securely.")).toBeVisible();
		expect(screen.queryByDisplayValue(/\*{2,}/)).not.toBeInTheDocument();
		fireEvent.click(
			within(screen.getByRole("form", { name: "SSO connection" })).getByRole("button", { name: "Save" }),
		);

		await waitFor(() =>
			expect(state.saveConnection).toHaveBeenCalledWith(
				expect.objectContaining({ id: "oidc-one", enabled: true, secretAction: "keep" }),
			),
		);
		expect(state.saveConnection.mock.calls[0][0]).not.toHaveProperty("secretValue");
	});

	it("requires explicit save and never enables a connection by selecting a protocol or testing", async () => {
		renderPage();
		fireEvent.click(screen.getByRole("button", { name: "Add connection" }));
		fireEvent.change(screen.getByLabelText("Protocol"), { target: { value: "oauth2" } });
		expect(screen.getByLabelText("Enabled")).not.toBeChecked();
		expect(screen.getByRole("button", { name: "Test saved connection" })).toBeDisabled();
		expect(state.saveConnection).not.toHaveBeenCalled();
		expect(state.testConnection).not.toHaveBeenCalled();

		fireEvent.click(screen.getByText("Partner SAML"));
		fireEvent.click(screen.getByRole("button", { name: "Test saved connection" }));
		await waitFor(() => expect(state.testConnection).toHaveBeenCalledWith("saml-one"));
		expect(state.saveConnection).not.toHaveBeenCalled();
	});

	it("requires the OAuth2 endpoint and identity fields before creating a connection", async () => {
		renderPage();
		fireEvent.click(screen.getByRole("button", { name: "Add connection" }));
		fireEvent.change(screen.getByLabelText("Protocol"), { target: { value: "oauth2" } });
		expect(screen.getByLabelText("Authorization URL")).toBeRequired();
		expect(screen.getByLabelText("Token URL")).toBeRequired();
		expect(screen.getByLabelText("UserInfo URL")).toBeRequired();
		fireEvent.click(
			within(screen.getByRole("form", { name: "SSO connection" })).getByRole("button", { name: "Save" }),
		);
		expect(state.saveConnection).not.toHaveBeenCalled();
	});

	it("normalizes a complete shared email list and rejects duplicates or domain rules", async () => {
		renderPage();
		const emails = screen.getByLabelText("Email addresses");
		fireEvent.change(emails, { target: { value: " Admin@Example.test \nUSER@example.test" } });
		fireEvent.click(
			within(screen.getByRole("form", { name: "Trusted emails" })).getByRole("button", { name: "Save" }),
		);
		await waitFor(() =>
			expect(state.updateAllowlist).toHaveBeenCalledWith({
				revision: 4,
				emails: ["admin@example.test", "user@example.test"],
			}),
		);

		fireEvent.change(emails, { target: { value: "admin@example.test\nADMIN@example.test\n@example.test" } });
		fireEvent.click(
			within(screen.getByRole("form", { name: "Trusted emails" })).getByRole("button", { name: "Save" }),
		);
		expect(await screen.findByText(/Enter one complete email address per line/)).toBeVisible();
		expect(state.updateAllowlist).toHaveBeenCalledTimes(1);
	});

	it("reloads all revisioned forms after a 409 conflict", async () => {
		state.updatePolicy.mockRejectedValueOnce(new Error("sso_revision_conflict"));
		renderPage();
		fireEvent.click(
			within(screen.getByRole("form", { name: "Login policy" })).getByRole("button", { name: "Save" }),
		);

		expect(await screen.findByText(/This configuration changed.*reloaded/i)).toBeVisible();
		expect(state.refetchAll).toHaveBeenCalledTimes(1);
	});

	it("previews SAML trust explicitly and submits the reviewed token outside config", async () => {
		state.previewSAML.mockResolvedValueOnce({
			entityId: "https://idp.example.test/entity",
			ssoUrl: "https://idp.example.test/sso",
			certificateFingerprints: ["aa11"],
			signRequests: true,
			spCertificate: "-----BEGIN CERTIFICATE-----\nPUBLIC\n-----END CERTIFICATE-----",
			importToken: "opaque-review-token",
		});
		renderPage();
		fireEvent.click(screen.getByText("Partner SAML"));
		fireEvent.click(screen.getByRole("button", { name: "Preview metadata" }));

		expect(await screen.findByText("Reviewed identity provider metadata")).toBeVisible();
		expect(screen.getByText("aa11")).toBeVisible();
		expect(screen.getByText("Effective request signing")).toBeVisible();
		expect(screen.getByText("Required by identity provider metadata")).toBeVisible();
		expect(screen.getByText(/BEGIN CERTIFICATE/)).toBeVisible();
		fireEvent.click(
			within(screen.getByRole("form", { name: "SSO connection" })).getByRole("button", { name: "Save" }),
		);

		await waitFor(() =>
			expect(state.saveConnection).toHaveBeenCalledWith(
				expect.objectContaining({
					id: "saml-one",
					samlImportToken: "opaque-review-token",
					config: expect.not.objectContaining({ samlImportToken: expect.anything() }),
				}),
			),
		);
	});

	it("clears a consumed SAML trust token only after a successful save", async () => {
		state.previewSAML.mockResolvedValueOnce({
			entityId: "https://idp.example.test/entity",
			ssoUrl: "https://idp.example.test/sso",
			certificateFingerprints: ["cc33"],
			signRequests: true,
			importToken: "single-use-review-token",
		});
		renderPage();
		fireEvent.click(screen.getByText("Partner SAML"));
		fireEvent.click(screen.getByRole("button", { name: "Preview metadata" }));
		expect(await screen.findByText("cc33")).toBeVisible();
		const form = screen.getByRole("form", { name: "SSO connection" });
		fireEvent.click(within(form).getByRole("button", { name: "Save" }));
		await waitFor(() => expect(state.saveConnection).toHaveBeenCalledTimes(1));
		fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Renamed SAML" } });
		fireEvent.click(within(form).getByRole("button", { name: "Save" }));
		await waitFor(() => expect(state.saveConnection).toHaveBeenCalledTimes(2));
		expect(state.saveConnection.mock.calls[0][0]).toHaveProperty("samlImportToken", "single-use-review-token");
		expect(state.saveConnection.mock.calls[1][0]).not.toHaveProperty("samlImportToken");
	});

	it("localizes known initial and preview failures without exposing raw codes", async () => {
		state.queryError = new Error("sso_key_restore_required");
		const first = renderPage();
		expect(screen.getByText(/restore the SSO installation key/i)).toBeVisible();
		expect(screen.queryByText("sso_key_restore_required")).not.toBeInTheDocument();
		first.unmount();

		state.queryError = null;
		state.previewSAML.mockRejectedValueOnce(new Error("sso_probe_failed"));
		renderPage();
		fireEvent.click(screen.getByText("Partner SAML"));
		fireEvent.click(screen.getByRole("button", { name: "Preview metadata" }));
		expect(await screen.findByText(/provider could not be reached/i)).toBeVisible();
		expect(screen.queryByText("sso_probe_failed")).not.toBeInTheDocument();
	});

	it("uses a localized generic fallback for unknown backend errors", async () => {
		state.updatePolicy.mockRejectedValueOnce(new Error("database provider secret detail"));
		renderPage();
		fireEvent.click(
			within(screen.getByRole("form", { name: "Login policy" })).getByRole("button", { name: "Save" }),
		);
		expect(await screen.findByText(/unable to load or save SSO settings/i)).toBeVisible();
		expect(screen.queryByText("database provider secret detail")).not.toBeInTheDocument();
	});

	it("invalidates reviewed SAML trust after a security-setting edit", async () => {
		state.previewSAML.mockResolvedValueOnce({
			entityId: "https://idp.example.test/entity",
			ssoUrl: "https://idp.example.test/sso",
			certificateFingerprints: ["aa11"],
			signRequests: true,
			importToken: "must-not-be-reused",
		});
		renderPage();
		fireEvent.click(screen.getByText("Partner SAML"));
		fireEvent.click(screen.getByRole("button", { name: "Preview metadata" }));
		expect(await screen.findByText("aa11")).toBeVisible();
		fireEvent.click(screen.getByLabelText("Sign authentication requests"));
		expect(screen.queryByText("aa11")).not.toBeInTheDocument();
		fireEvent.click(
			within(screen.getByRole("form", { name: "SSO connection" })).getByRole("button", { name: "Save" }),
		);
		expect(await screen.findByText(/preview metadata again/i)).toBeVisible();
		expect(state.saveConnection).not.toHaveBeenCalled();
	});

	it("creates SAML with clear secret and a reviewed import token", async () => {
		state.previewSAML.mockResolvedValueOnce({
			entityId: "https://idp.example.test/entity",
			ssoUrl: "https://idp.example.test/sso",
			certificateFingerprints: ["bb22"],
			signRequests: false,
			importToken: "new-saml-review",
		});
		renderPage();
		fireEvent.click(screen.getByRole("button", { name: "Add connection" }));
		fireEvent.change(screen.getByLabelText("Protocol"), { target: { value: "saml" } });
		fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "New SAML" } });
		fireEvent.change(screen.getByLabelText("IdP metadata URL"), {
			target: { value: "https://new-idp.example.test/metadata" },
		});
		fireEvent.change(screen.getByLabelText("SP entity ID"), {
			target: { value: "https://npm.example.test/new-saml" },
		});
		fireEvent.change(screen.getByLabelText("Email attribute"), { target: { value: "mail" } });
		fireEvent.click(screen.getByRole("button", { name: "Preview metadata" }));
		expect(await screen.findByText("bb22")).toBeVisible();
		fireEvent.click(
			within(screen.getByRole("form", { name: "SSO connection" })).getByRole("button", { name: "Save" }),
		);
		await waitFor(() =>
			expect(state.saveConnection).toHaveBeenCalledWith(
				expect.objectContaining({
					protocol: "saml",
					secretAction: "clear",
					samlImportToken: "new-saml-review",
					enabled: false,
				}),
			),
		);
	});

	it("removes a connection with its optimistic revision", async () => {
		renderPage();
		fireEvent.click(screen.getByText("Partner SAML"));
		fireEvent.click(screen.getByRole("button", { name: "Remove connection" }));
		await waitFor(() => expect(state.deleteConnection).toHaveBeenCalledWith({ id: "saml-one", revision: 1 }));
	});

	it("keeps create and delete editors open when their mutation fails", async () => {
		state.deleteConnection.mockRejectedValueOnce(new Error("sso_configuration_unavailable"));
		renderPage();
		fireEvent.click(screen.getByText("Partner SAML"));
		fireEvent.click(screen.getByRole("button", { name: "Remove connection" }));
		expect(await screen.findByDisplayValue("Partner SAML")).toBeVisible();

		state.saveConnection.mockRejectedValueOnce(new Error("sso_invalid_configuration"));
		fireEvent.click(screen.getByRole("button", { name: "Add connection" }));
		fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Failed OIDC" } });
		fireEvent.change(screen.getByLabelText("Issuer URL"), { target: { value: "https://idp.example.test" } });
		fireEvent.change(screen.getByLabelText("Client ID"), { target: { value: "npm" } });
		fireEvent.change(screen.getByLabelText("Client secret"), { target: { value: "temporary-secret" } });
		fireEvent.click(
			within(screen.getByRole("form", { name: "SSO connection" })).getByRole("button", { name: "Save" }),
		);
		expect(await screen.findByDisplayValue("Failed OIDC")).toBeVisible();
	});

	it("saves disabling as an explicit revisioned connection update", async () => {
		renderPage();
		fireEvent.click(screen.getByText("Company OIDC"));
		fireEvent.click(screen.getByLabelText("Enabled"));
		fireEvent.click(
			within(screen.getByRole("form", { name: "SSO connection" })).getByRole("button", { name: "Save" }),
		);
		await waitFor(() =>
			expect(state.saveConnection).toHaveBeenCalledWith(
				expect.objectContaining({ id: "oidc-one", revision: 2, enabled: false }),
			),
		);
	});

	it("imports legacy OAuth only as the disabled draft returned by the server", async () => {
		state.importLegacy.mockResolvedValueOnce({
			id: "legacy",
			protocol: "oauth2",
			name: "Imported OAuth",
			enabled: false,
			revision: 1,
			hasSecret: true,
			config: {},
		});
		renderPage();
		fireEvent.click(screen.getByRole("button", { name: "Import legacy OAuth" }));
		await waitFor(() => expect(state.importLegacy).toHaveBeenCalledTimes(1));
		expect(state.saveConnection).not.toHaveBeenCalled();
		expect(state.refetchAll).toHaveBeenCalledTimes(1);
	});
});
