import { fireEvent, render, waitFor } from "@testing-library/react";
import { Form, Formik, useFormikContext } from "formik";
import { BasicAuthFields } from "src/components";
import { describe, expect, it } from "vitest";

const row = (username: string) => ({ username, password: "" });

const renderFields = (initialValues: any[] = [], name?: string) => {
	const Values = () => {
		const { values } = useFormikContext();
		return <pre>{JSON.stringify(values)}</pre>;
	};

	const { container } = render(
		<Formik initialValues={{ [name || "items"]: initialValues }} onSubmit={() => {}}>
			<Form>
				<BasicAuthFields initialValues={initialValues} name={name} />
				<Values />
			</Form>
		</Formik>,
	);

	const inputs = (type: string) => Array.from(container.querySelectorAll<HTMLInputElement>(`input[type="${type}"]`));
	const attributes = (attribute: string) =>
		[...inputs("text"), ...inputs("password")].map((input) => input.getAttribute(attribute));

	return {
		usernames: () => inputs("text"),
		passwords: () => inputs("password"),
		names: () => attributes("name"),
		autocompletes: () => attributes("autocomplete"),
		add: () => container.querySelector<HTMLButtonElement>("button.btn-sm") as HTMLButtonElement,
		remove: (idx: number) => container.querySelectorAll<HTMLButtonElement>("button.btn-ghost")[idx],
		submitted: () => container.querySelector("pre")?.textContent,
	};
};

describe("BasicAuthFields", () => {
	it.each([
		{ rows: "a blank row", initialValues: [], name: undefined, expected: ["items-username-0", "items-password-0"] },
		{
			rows: "two rows",
			initialValues: [row("one"), row("two")],
			name: undefined,
			expected: ["items-username-0", "items-username-1", "items-password-0", "items-password-1"],
		},
		{ rows: "a named field", initialValues: [], name: "auth", expected: ["auth-username-0", "auth-password-0"] },
		{ rows: "an empty field name", initialValues: [], name: "", expected: ["-username-0", "-password-0"] },
	])("names the inputs of $rows", ({ initialValues, name, expected }) => {
		expect(renderFields(initialValues, name).names()).toEqual(expected);
	});

	it.each([
		{ rows: "a blank row", initialValues: [], expected: ["new-password", "new-password"] },
		{
			rows: "two rows",
			initialValues: [row("one"), row("two")],
			expected: ["new-password", "new-password", "new-password", "new-password"],
		},
	])("sets autocomplete new-password on $rows", ({ initialValues, expected }) => {
		expect(renderFields(initialValues).autocompletes()).toEqual(expected);
	});

	it("names an added row with the next index", () => {
		const view = renderFields([row("one")]);
		fireEvent.click(view.add());
		expect(view.names()).toEqual(["items-username-0", "items-username-1", "items-password-0", "items-password-1"]);
	});

	it("sets autocomplete new-password on an added row", () => {
		const view = renderFields([row("one")]);
		fireEvent.click(view.add());
		expect(view.autocompletes()).toEqual(["new-password", "new-password", "new-password", "new-password"]);
	});

	it("renumbers the names when an earlier row is removed", () => {
		const view = renderFields([row("one"), row("two")]);
		fireEvent.click(view.remove(0));
		expect(view.names()).toEqual(["items-username-0", "items-password-0"]);
	});

	it("keeps the name and autocomplete of a row that is typed into", () => {
		const view = renderFields();
		fireEvent.change(view.usernames()[0], { target: { value: "typed" } });
		const input = view.usernames()[0];
		expect([input.getAttribute("name"), input.getAttribute("autocomplete")]).toEqual([
			"items-username-0",
			"new-password",
		]);
	});

	it("renders the username of an existing row", () => {
		expect(renderFields([row("one")]).usernames()[0].value).toEqual("one");
	});

	it("shows the saved password placeholder on an existing row", () => {
		const view = renderFields([row("one")]);
		expect(view.passwords()[0].getAttribute("placeholder")).toEqual("••••••••");
	});

	it("leaves the password placeholder empty on a blank row", () => {
		expect(renderFields().passwords()[0].getAttribute("placeholder")).toEqual("");
	});

	it("submits the items array after a row is typed into", async () => {
		const view = renderFields();
		fireEvent.change(view.usernames()[0], { target: { value: "typed" } });
		fireEvent.change(view.passwords()[0], { target: { value: "secret" } });
		await waitFor(() => {
			expect(view.submitted()).toEqual(JSON.stringify({ items: [{ username: "typed", password: "secret" }] }));
		});
	});
});
