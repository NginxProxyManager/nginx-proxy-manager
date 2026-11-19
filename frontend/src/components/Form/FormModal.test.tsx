import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Field, Form } from "formik";
import Modal from "react-bootstrap/Modal";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FormModal } from "./FormModal";

const renderModal = (onHide = vi.fn(), preventHide = false) => {
	render(
		<FormModal show onHide={onHide} preventHide={preventHide} initialValues={{ name: "" }} onSubmit={vi.fn()}>
			{({ onHide: hide }) => (
				<Form>
					<Modal.Header closeButton />
					<label htmlFor="name">Name</label>
					<Field id="name" name="name" />
					<button type="button" onClick={hide}>
						Cancel
					</button>
				</Form>
			)}
		</FormModal>,
	);
	return onHide;
};

describe("FormModal", () => {
	beforeEach(() => {
		vi.stubGlobal("confirm", vi.fn());
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("dismisses a pristine form without confirmation", () => {
		const onHide = renderModal();
		const confirm = vi.spyOn(window, "confirm");

		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

		expect(confirm).not.toHaveBeenCalled();
		expect(onHide).toHaveBeenCalledOnce();
	});

	it("keeps a dirty form open when dismissal is cancelled", () => {
		const onHide = renderModal();
		const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
		fireEvent.change(screen.getByLabelText("Name"), { target: { value: "example.com" } });

		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		fireEvent.click(screen.getByRole("button", { name: "Close" }));
		fireEvent.click(document.querySelector(".modal") as Element);
		fireEvent.keyDown(document, { key: "Escape", keyCode: 27 });

		expect(confirm).toHaveBeenCalledTimes(4);
		expect(onHide).not.toHaveBeenCalled();
		expect(screen.getByLabelText("Name")).toHaveValue("example.com");
	});

	it("dismisses a dirty form after confirmation", () => {
		const onHide = renderModal();
		vi.spyOn(window, "confirm").mockReturnValue(true);
		fireEvent.change(screen.getByLabelText("Name"), { target: { value: "example.com" } });

		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

		expect(onHide).toHaveBeenCalledOnce();
	});

	it("does not offer to discard changes while submission is in progress", () => {
		const onHide = renderModal(vi.fn(), true);
		const confirm = vi.spyOn(window, "confirm");
		fireEvent.change(screen.getByLabelText("Name"), { target: { value: "example.com" } });

		fireEvent.click(screen.getByRole("button", { name: "Close" }));

		expect(confirm).not.toHaveBeenCalled();
		expect(onHide).not.toHaveBeenCalled();
		expect(screen.getByLabelText("Name")).toHaveValue("example.com");
	});
});
