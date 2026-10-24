import { describe, expect, it } from "vitest";
import { buildUserPayload } from "./UserModal";

describe("UserModal update payload", () => {
	it("allows the sole full-admin to disable their own exception only in the explicit admin editor", () => {
		const admin = { id: 1, capabilities: ["full-admin"], passwordLoginEnabled: true };
		const values = { name: "Admin", email: "admin@example.com", isAdmin: true, passwordLoginEnabled: false };
		expect(buildUserPayload(1, admin, admin, values).passwordLoginEnabled).toBe(false);
		expect(buildUserPayload("me", admin, admin, values)).not.toHaveProperty("passwordLoginEnabled");
	});
	it("does not resend stale policy fields during a profile edit", () => {
		const payload = buildUserPayload(
			2,
			{ id: 2, capabilities: ["hosts.view"], passwordLoginEnabled: false },
			{ id: 1, capabilities: ["full-admin"] },
			{ name: "Renamed", email: "target@example.com", isDisabled: false, isAdmin: false, passwordLoginEnabled: false },
		);
		expect(payload).toEqual({ id: 2, name: "Renamed", email: "target@example.com", isDisabled: false });
	});

	it("sends password and full-admin policy only after an explicit change", () => {
		const payload = buildUserPayload(
			2,
			{ id: 2, capabilities: ["hosts.view"], passwordLoginEnabled: false },
			{ id: 1, capabilities: ["full-admin"] },
			{ name: "Target", email: "target@example.com", isDisabled: false, isAdmin: true, passwordLoginEnabled: true },
		);
		expect(payload.capabilities).toEqual(["hosts.view", "full-admin"]);
		expect(payload.passwordLoginEnabled).toBe(true);
	});
});
