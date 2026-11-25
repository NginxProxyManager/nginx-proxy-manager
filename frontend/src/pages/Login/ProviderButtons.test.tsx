import "@testing-library/jest-dom/vitest";
import {
	IconBrandAzure,
	IconBrandGithub,
	IconBrandGoogle,
	IconBrandWindows,
	IconKey,
	IconShieldLock,
} from "@tabler/icons-react";
import { cleanup, render, screen } from "@testing-library/react";
import { lazy, Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getProviderIcon } from "./ProviderButtons";

vi.mock("src/api/backend", () => ({
	providerLoginUrl: (id: number) => `/api/auth/${id}/login`,
}));
vi.mock("src/locale", () => ({
	T: ({ data }: { data: { name: string } }) => <>Continue with {data.name}</>,
}));

describe("getProviderIcon", () => {
	it.each([
		["Google Workspace", "oauth", IconBrandGoogle],
		["github", "oauth", IconBrandGithub],
		["Microsoft Entra ID", "oauth", IconBrandAzure],
		["Office 365", "saml", IconBrandWindows],
		["Company Keycloak", "oauth", IconKey],
		["Company IdP", "saml", IconShieldLock],
	] as const)("picks the icon for %s (%s)", (name, type, expected) => {
		expect(getProviderIcon({ name, type })).toBe(expected);
	});
});

describe("ProviderButtons", () => {
	afterEach(() => {
		cleanup();
	});

	it("renders a sign in link per provider once the lazy chunk loads", async () => {
		const ProviderButtons = lazy(() => import("./ProviderButtons"));

		render(
			<Suspense fallback={null}>
				<ProviderButtons
					providers={[
						{ id: 2, name: "Google", type: "oauth" },
						{ id: 3, name: "Company IdP", type: "saml" },
					]}
				/>
			</Suspense>,
		);

		expect(await screen.findByRole("link", { name: "Continue with Google" })).toHaveAttribute(
			"href",
			"/api/auth/2/login",
		);
		expect(screen.getByRole("link", { name: "Continue with Company IdP" })).toHaveAttribute(
			"href",
			"/api/auth/3/login",
		);
	});
});
