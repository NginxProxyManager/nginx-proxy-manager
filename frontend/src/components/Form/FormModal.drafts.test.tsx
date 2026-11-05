import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Form } from "formik";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BasicAuthFields } from "./BasicAuthFields";
import { FormModal } from "./FormModal";
import { LocationsFields } from "./LocationsFields";

vi.mock("./AccessField", () => ({ AccessField: () => null }));

const renderDraft = (initialValues: Record<string, unknown>, children: ReactNode) => {
	const onHide = vi.fn();
	render(
		<FormModal show onHide={onHide} initialValues={initialValues} onSubmit={vi.fn()}>
			{({ onHide: hide }) => (
				<Form>
					{children}
					<button type="button" onClick={hide}>
						Cancel
					</button>
				</Form>
			)}
		</FormModal>,
	);
	return onHide;
};

describe("FormModal local drafts", () => {
	beforeEach(() => {
		vi.stubGlobal(
			"confirm",
			vi.fn(() => false),
		);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it("protects a location draft without a path", () => {
		const onHide = renderDraft({ locations: [] }, <LocationsFields initialValues={[]} />);
		fireEvent.click(screen.getByRole("button", { name: "Add Location" }));
		fireEvent.change(screen.getByPlaceholderText("eg: 10.0.0.1/path/"), { target: { value: "example.com" } });

		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

		expect(window.confirm).toHaveBeenCalledOnce();
		expect(onHide).not.toHaveBeenCalled();
	});

	it("protects a basic auth password draft without a username", () => {
		const onHide = renderDraft({ items: [] }, <BasicAuthFields initialValues={[]} />);
		fireEvent.change(document.querySelector('input[type="password"]') as Element, {
			target: { value: "secret" },
		});

		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

		expect(window.confirm).toHaveBeenCalledOnce();
		expect(onHide).not.toHaveBeenCalled();
	});
});
