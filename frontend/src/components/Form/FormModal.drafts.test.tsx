import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
	// The location host field asks the API for upstream suggestions
	render(
		<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
			<FormModal show onHide={onHide} initialValues={initialValues} onSubmit={vi.fn()}>
				{({ onHide: hide }) => (
					<Form>
						{children}
						<button type="button" onClick={hide}>
							Cancel
						</button>
					</Form>
				)}
			</FormModal>
		</QueryClientProvider>,
	);
	return onHide;
};

describe("FormModal local drafts", () => {
	beforeEach(() => {
		vi.stubGlobal(
			"confirm",
			vi.fn(() => false),
		);
		// Suggestions never arrive, so the test makes no network requests
		vi.stubGlobal(
			"fetch",
			vi.fn(() => new Promise(() => {})),
		);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it("protects a location draft without a path", () => {
		const onHide = renderDraft({ locations: [] }, <LocationsFields initialValues={[]} />);
		fireEvent.click(screen.getByRole("button", { name: "Add Location" }));
		fireEvent.change(screen.getByLabelText("Forward Hostname / IP"), { target: { value: "example.com" } });

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
