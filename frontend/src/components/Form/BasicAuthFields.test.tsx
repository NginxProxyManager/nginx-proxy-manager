import { fireEvent, render, waitFor } from "@testing-library/react";
import { Form, Formik } from "formik";
import type { AccessListItem } from "src/api/backend";
import { BasicAuthFields } from "src/components";
import { describe, expect, it, vi } from "vitest";

const renderFields = (items: AccessListItem[], name?: string, onSubmit = vi.fn()) =>
	render(
		<Formik initialValues={{ [name || "items"]: items }} onSubmit={onSubmit}>
			<Form>
				<BasicAuthFields initialValues={items} name={name} />
			</Form>
		</Formik>,
	).container;

const expectFields = (container: HTMLElement, names: string[]) => {
	const inputs = Array.from(container.querySelectorAll("input"));
	expect(inputs.map((input) => input.getAttribute("name"))).toEqual(names);
	expect(inputs.map((input) => input.getAttribute("autocomplete"))).toEqual(names.map(() => "new-password"));
};

describe("BasicAuthFields", () => {
	it.each([
		[undefined, ["items-username-0", "items-password-0"]],
		["auth", ["auth-username-0", "auth-password-0"]],
		["", ["-username-0", "-password-0"]],
	])("names and marks the inputs for field %j", (name, names) => {
		expectFields(renderFields([], name), names);
	});

	it("names and marks the inputs as rows are added, edited and removed", () => {
		const container = renderFields([{ username: "one", password: "" }]);
		const click = (selector: string) => fireEvent.click(container.querySelector(selector) as HTMLButtonElement);

		click("button.btn-sm");
		fireEvent.change(container.querySelectorAll("input")[2], { target: { value: "two" } });
		expectFields(container, ["items-username-0", "items-password-0", "items-username-1", "items-password-1"]);

		click("button.btn-ghost");
		expectFields(container, ["items-username-0", "items-password-0"]);

		click("button.btn-ghost");
		expectFields(container, ["items-username-0", "items-password-0"]);
	});

	it("submits the typed username and password", async () => {
		const onSubmit = vi.fn();
		const container = renderFields([], undefined, onSubmit);
		const [username, password] = Array.from(container.querySelectorAll("input"));

		fireEvent.change(username, { target: { value: "typed" } });
		fireEvent.change(password, { target: { value: "secret" } });
		fireEvent.submit(container.querySelector("form") as HTMLFormElement);

		await waitFor(() => expect(onSubmit).toHaveBeenCalled());
		expect(onSubmit.mock.calls[0][0]).toEqual({ items: [{ username: "typed", password: "secret" }] });
	});
});
