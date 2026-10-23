import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { RawIntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vitest";
import type { User } from "src/api/backend";
import { createIntl } from "src/locale";
import Table from "./Table";

vi.mock("src/components", async (original) => ({
	...(await original()),
	ValueWithDateFormatter: ({ value }: { value: string }) => <span>{value}</span>,
}));

const intl = createIntl({ locale: "en", messages: { "column.name": "Name", "column.email": "Email", "permissions.capabilities": "Capabilities", "column.status": "Status" } });

describe("Users table", () => {
	it("renders a zero-capability account without crashing", () => {
		const account: User = { id: 2, createdOn: "", modifiedOn: "", isDisabled: false, email: "pending@example.test", name: "Pending", gravatarUrl: "", capabilities: [], passwordLoginEnabled: false, hasLocalCredential: false, canSetLocalPassword: true };
		render(<RawIntlProvider value={intl}><Table data={[account]} currentUserId={1} /></RawIntlProvider>);
		expect(screen.getByText("Pending")).toBeVisible();
		expect(screen.getByText("—")).toBeVisible();
	});
});
