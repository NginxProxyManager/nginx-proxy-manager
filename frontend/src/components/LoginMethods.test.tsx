import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { test, expect, vi, afterEach } from "vitest";
import { LoginMethods } from "./LoginMethods";
const request = vi.hoisted(() => vi.fn());
vi.mock("src/api/backend/oidc", () => ({ oidcRequest: request }));
vi.mock("src/locale", () => ({ T: ({ id }: { id: string }) => id }));
vi.mock("src/components", () => ({
	Loading: () => null,
	Button: ({ children, isLoading, actionType, ...props }: any) => <button {...props}>{children}</button>,
}));
afterEach(() => {
	cleanup();
	request.mockReset();
	vi.restoreAllMocks();
});
test("disabled provider prevents linking, without any password fields", async () => {
	request.mockResolvedValue({ linked: false, issuer: "", available: false });
	render(<LoginMethods />);
	expect(await screen.findByRole("button", { name: "oidc.link" })).toBeDisabled();
	expect(screen.getByText("oidc.not-configured")).toBeVisible();
	expect(document.querySelector('input[type="password"]')).toBeNull();
});
test("link uses the existing session with an empty payload", async () => {
	request
		.mockResolvedValueOnce({ linked: false, issuer: "", available: true })
		.mockResolvedValueOnce({ url: "https://id.example/authorize" });
	const navigate = vi.spyOn(window.location, "assign").mockImplementation(() => {});
	render(<LoginMethods />);
	fireEvent.click(await screen.findByRole("button", { name: "oidc.link" }));
	await waitFor(() => expect(navigate).toHaveBeenCalledWith("https://id.example/authorize"));
	expect(request).toHaveBeenLastCalledWith("link", "POST", {});
});
test("linked account can unlink using the same area", async () => {
	request
		.mockResolvedValueOnce({ linked: true, issuer: "https://id.example", available: true })
		.mockResolvedValueOnce({ linked: false });
	render(<LoginMethods />);
	fireEvent.click(await screen.findByRole("button", { name: "oidc.unlink" }));
	await screen.findByRole("button", { name: "oidc.link" });
	expect(request).toHaveBeenLastCalledWith("unlink", "POST", {});
});
