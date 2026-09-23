import { fireEvent, render, waitFor } from "@testing-library/react";
import { Form, Formik } from "formik";
import { BasicAuthFields } from "src/components";
import { describe, expect, it } from "vitest";

const row = (username: string) => ({ username, password: "" });

const renderFields = (initialValues: any[] = [], name?: string, onSubmit: (values: any) => void = () => {}) => {
	const { container } = render(
		<Formik initialValues={{ [name || "items"]: initialValues }} onSubmit={onSubmit}>
			<Form>
				<BasicAuthFields initialValues={initialValues} name={name} />
			</Form>
		</Formik>,
	);

	const inputs = (type: string) => Array.from(container.querySelectorAll<HTMLInputElement>(`input[type="${type}"]`));

	return {
		form: () => container.querySelector("form") as HTMLFormElement,
		usernames: () => inputs("text"),
		passwords: () => inputs("password"),
		attributes: (attribute: string) =>
			[...inputs("text"), ...inputs("password")].map((input) => input.getAttribute(attribute)),
		add: () => container.querySelector<HTMLButtonElement>("button.btn-sm") as HTMLButtonElement,
		remove: (idx: number) => container.querySelectorAll<HTMLButtonElement>("button.btn-ghost")[idx],
	};
};

type Fields = ReturnType<typeof renderFields>;

const marked = (count: number) => Array(count).fill("new-password");

describe("BasicAuthFields", () => {
	it.each([
		{ rows: "a blank row", initialValues: [], name: undefined, names: ["items-username-0", "items-password-0"] },
		{
			rows: "two rows",
			initialValues: [row("one"), row("two")],
			name: undefined,
			names: ["items-username-0", "items-username-1", "items-password-0", "items-password-1"],
		},
		{ rows: "a named field", initialValues: [], name: "auth", names: ["auth-username-0", "auth-password-0"] },
		{ rows: "an empty field name", initialValues: [], name: "", names: ["-username-0", "-password-0"] },
	])("names and marks $rows", ({ initialValues, name, names }) => {
		const view = renderFields(initialValues, name);
		expect(view.attributes("name")).toEqual(names);
		expect(view.attributes("autocomplete")).toEqual(marked(names.length));
	});

	it.each([
		{
			change: "a row is added",
			initialValues: [row("one")],
			act: (view: Fields) => fireEvent.click(view.add()),
			names: ["items-username-0", "items-username-1", "items-password-0", "items-password-1"],
		},
		{
			change: "an earlier row is removed",
			initialValues: [row("one"), row("two")],
			act: (view: Fields) => fireEvent.click(view.remove(0)),
			names: ["items-username-0", "items-password-0"],
		},
		{
			change: "the only row is removed",
			initialValues: [row("one")],
			act: (view: Fields) => fireEvent.click(view.remove(0)),
			names: ["items-username-0", "items-password-0"],
		},
		{
			change: "a row is typed into",
			initialValues: [],
			act: (view: Fields) => fireEvent.change(view.usernames()[0], { target: { value: "typed" } }),
			names: ["items-username-0", "items-password-0"],
		},
	])("names and marks the rows after $change", ({ initialValues, act, names }) => {
		const view = renderFields(initialValues);
		act(view);
		expect(view.attributes("name")).toEqual(names);
		expect(view.attributes("autocomplete")).toEqual(marked(names.length));
	});

	it("submits the typed username and password", async () => {
		let submitted: unknown;
		const view = renderFields([], undefined, (values) => {
			submitted = values;
		});

		fireEvent.change(view.usernames()[0], { target: { value: "typed" } });
		fireEvent.change(view.passwords()[0], { target: { value: "secret" } });
		fireEvent.submit(view.form());

		await waitFor(() => {
			expect(submitted).toEqual({ items: [{ username: "typed", password: "secret" }] });
		});
	});
});
