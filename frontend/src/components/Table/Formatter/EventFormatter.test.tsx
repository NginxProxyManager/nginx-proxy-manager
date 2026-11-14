import { cleanup, render, screen } from "@testing-library/react";
import type { AuditLog } from "src/api/backend";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventFormatter } from "./EventFormatter";

vi.mock("src/context", () => ({ useLocaleState: () => ({ locale: "en" }) }));

const regeneration = (meta: Record<string, unknown>): AuditLog => ({
	id: 1,
	createdOn: "2026-11-13T10:00:00Z",
	modifiedOn: "2026-11-13T10:00:00Z",
	userId: 1,
	objectType: "nginx-config",
	objectId: 0,
	action: "updated",
	meta,
});

describe("audit log entries of a regeneration", () => {
	afterEach(() => cleanup());

	it("shows a successful run with its counts", () => {
		const { container } = render(<EventFormatter row={regeneration({ checked: 5, offline: 1 })} />);
		expect(screen.getByText("5 hosts, 1 offline")).toBeInTheDocument();
		expect(container).not.toHaveTextContent("Failed");
		expect(container.querySelector("svg.text-red")).toBeNull();
	});

	it("shows a run that failed before it counted anything as failed", () => {
		const { container } = render(
			<EventFormatter row={regeneration({ checked: null, offline: null, error: "nginx rejected the reload" })} />,
		);
		expect(screen.getByText("Failed")).toBeInTheDocument();
		expect(container).not.toHaveTextContent("0 hosts");
		expect(container.querySelector("svg.text-red")).not.toBeNull();
	});

	it("shows a run that failed half way with what it did until then", () => {
		render(<EventFormatter row={regeneration({ checked: 1, offline: 0, error: "Could not load stream rows" })} />);
		expect(screen.getByText("Failed after 1 host, 0 offline")).toBeInTheDocument();
	});
});
