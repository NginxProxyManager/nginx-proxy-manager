import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OIDC from "./OIDC";

const request = vi.hoisted(() => vi.fn());
vi.mock("src/api/backend/oidc", () => ({ oidcRequest: request }));
vi.mock("src/locale", () => ({
	T: ({ id }: { id: string }) => id,
	intl: { formatMessage: ({ id }: { id: string }) => id },
}));
vi.mock("src/components", () => ({
	Loading: () => null,
	Button: ({ children, isLoading, actionType, ...props }: any) => <button {...props}>{children}</button>,
}));
const config = {
	enabled: true,
	autoLogin: false,
	issuer: "https://id.example",
	publicUrl: "https://npm.example",
	clientId: "client",
	clientSecretConfigured: true,
	scopes: "openid",
	revision: "r1",
	callbackUrl: "https://npm.example/api/oidc/callback",
	tokenAuthMethod: "auto",
};
describe("OIDC settings", () => {
	beforeEach(() => request.mockReset());
	it("keeps secrets blank and locks the dedicated form until a delayed save completes", async () => {
		let finish: (v: unknown) => void = () => {};
		request.mockResolvedValueOnce(config).mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		render(<OIDC />);
		const issuer = await screen.findByLabelText("oidc.issuer");
		expect(screen.getByLabelText("oidc.client-secret")).toHaveValue("");
		fireEvent.change(issuer, { target: { value: "https://new.example" } });
		fireEvent.click(screen.getByRole("button", { name: "save" }));
		await waitFor(() => expect(issuer).toBeDisabled());
		expect(screen.getByLabelText("oidc.client-secret")).toBeDisabled();
		expect(request.mock.calls[1][0]).toBe("settings");
		expect(request.mock.calls[1][1]).toBe("PUT");
		expect(request.mock.calls[1][2].clientSecret).toBe("");
		finish({ ...config, issuer: "https://new.example", revision: "r2" });
		await waitFor(() => expect(issuer).not.toBeDisabled());
		expect(await screen.findByText("oidc.saved")).toBeVisible();
	});
});
