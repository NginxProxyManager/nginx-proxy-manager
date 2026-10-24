import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PendingAccess from "./index";

const state = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock("src/context", () => ({ useAuthState: () => ({ logout: state.logout }) }));
vi.mock("src/components", () => ({
	Button: ({ children, onClick }: any) => <button type="button" onClick={onClick}>{children}</button>,
	LocalePicker: () => null,
	Page: ({ children }: any) => <main>{children}</main>,
	ThemeSwitcher: () => null,
}));

afterEach(cleanup);

describe("Pending access", () => {
	it("reports that offline logout revocation was not confirmed", async () => {
		state.logout.mockRejectedValueOnce(new Error("logout_unconfirmed"));
		render(<PendingAccess />);
		fireEvent.click(screen.getByRole("button"));
		expect(await screen.findByText(/server could not confirm session revocation/i)).toBeVisible();
	});
});
