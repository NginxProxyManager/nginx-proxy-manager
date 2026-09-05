import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => vi.fn());
vi.mock("react-toastify", () => ({ toast }));
vi.mock("src/locale", () => ({
	intl: {
		formatMessage: ({ id }: { id: string }, values?: { object?: string }) =>
			values?.object ? `${id}:${values.object}` : id,
	},
}));

import { showError, showObjectSuccess, showSuccess } from "./helpers";
import { Msg } from "./Msg";

describe("notifications", () => {
	it("renders success, error, and neutral messages", () => {
		const view = render(<Msg data={{ type: "success", title: "Saved", message: "Done" }} />);
		expect(screen.getByRole("alert")).toHaveClass("success");
		expect(view.container.querySelector(".tabler-icon-check")).toBeInTheDocument();
		view.rerender(<Msg data={{ type: "error", title: "Failed", message: "Try again" }} />);
		expect(view.container.querySelector(".tabler-icon-exclamation-circle")).toBeInTheDocument();
		view.rerender(<Msg data={{ message: "Plain" }} />);
		expect(screen.getByText("Plain")).toBeInTheDocument();
		expect(view.container.querySelector(".toast-header")).not.toBeInTheDocument();
	});

	it("dispatches success, error, and object notifications", () => {
		showSuccess("Saved");
		showError("Failed");
		showObjectSuccess("proxy-host", "created");
		expect(toast).toHaveBeenCalledTimes(3);
		expect(toast.mock.calls[0][1].data).toEqual({ type: "success", title: "notification.success", message: "Saved" });
		expect(toast.mock.calls[1][1].data).toEqual({ type: "error", title: "notification.error", message: "Failed" });
		expect(toast.mock.calls[2][1].data.message).toBe("notification.object-created:proxy-host");
	});
});
