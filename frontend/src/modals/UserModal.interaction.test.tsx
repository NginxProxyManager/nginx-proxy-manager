import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RawIntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createIntl } from "src/locale";
import { UserEditor } from "./UserModal";

const state = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("src/hooks", () => ({
	useUser: () => ({ data: { id: 1, name: "Only Admin", email: "admin@example.com", capabilities: ["full-admin"], passwordLoginEnabled: true, isDisabled: false } }),
	useSetUser: () => ({ mutate: state.save }),
}));
vi.mock("src/notifications", () => ({ showObjectSuccess: vi.fn() }));
const intl = createIntl({ locale: "en", messages: { "user.password-login-enabled": "Password login", "role.admin": "Administrator", disabled: "Disabled", save: "Save", cancel: "Cancel" } });
afterEach(() => { cleanup(); state.save.mockReset(); });

describe("explicit self administrator editor", () => {
	it("lets the only full administrator switch off the password exception without changing their grants", async () => {
		render(<RawIntlProvider value={intl}><UserEditor {...({ id: 1, visible: true, remove: vi.fn() } as any)} /></RawIntlProvider>);
		expect(screen.getByLabelText("Administrator")).toBeDisabled();
		expect(screen.getByLabelText("Disabled")).toBeDisabled();
		fireEvent.click(screen.getByLabelText(/administrator password login/i));
		fireEvent.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(state.save).toHaveBeenCalled());
		expect(state.save.mock.calls[0][0]).toEqual({ id: 1, name: "Only Admin", email: "admin@example.com", passwordLoginEnabled: false });
	});

	it("keeps self profile editing free of policy controls", () => {
		render(<RawIntlProvider value={intl}><UserEditor {...({ id: "me", visible: true, remove: vi.fn() } as any)} /></RawIntlProvider>);
		expect(screen.queryByLabelText(/administrator password login/i)).not.toBeInTheDocument();
	});

	it("does not display a password policy control ignored by new-user creation", () => {
		render(<RawIntlProvider value={intl}><UserEditor {...({ id: "new", visible: true, remove: vi.fn() } as any)} /></RawIntlProvider>);
		expect(screen.queryByLabelText(/administrator password login/i)).not.toBeInTheDocument();
	});
});
