import { fireEvent, render, waitFor } from "@testing-library/react";
import { Form, Formik, useFormikContext } from "formik";
import { BasicAuthFields } from "src/components";
import { describe, expect, it } from "vitest";

// The Authorization tab of the Access List modal is always mounted, even while
// another tab is shown, so browser password managers can fill these inputs
// without the user ever seeing them. They only honour "new-password" here:
// "off" is ignored for credential fields.
const renderFields = (initialValues: any[] = [], name?: string) => {
	const field = name || "items";
	const { container } = render(
		<Formik initialValues={{ [field]: initialValues }} onSubmit={() => {}}>
			<Form>
				<BasicAuthFields initialValues={initialValues} name={name} />
			</Form>
		</Formik>,
	);

	const inputs = (type: string) => Array.from(container.querySelectorAll<HTMLInputElement>(`input[type="${type}"]`));

	return { container, usernames: inputs("text"), passwords: inputs("password") };
};

// Same render, but re-queried after an interaction, and with the Formik values
// rendered into the DOM so the submitted payload can be observed.
const renderInteractive = (initialValues: any[] = []) => {
	const FormValues = () => {
		const { values } = useFormikContext();
		return <pre data-testid="values">{JSON.stringify(values)}</pre>;
	};

	const { container } = render(
		<Formik initialValues={{ items: initialValues }} onSubmit={() => {}}>
			<Form>
				<BasicAuthFields initialValues={initialValues} />
				<FormValues />
			</Form>
		</Formik>,
	);

	const inputs = (type: string) => Array.from(container.querySelectorAll<HTMLInputElement>(`input[type="${type}"]`));
	const buttons = (selector: string) => Array.from(container.querySelectorAll<HTMLButtonElement>(selector));

	return {
		container,
		usernames: () => inputs("text"),
		passwords: () => inputs("password"),
		addButton: () => buttons("button.btn-sm")[0],
		removeButtons: () => buttons("button.btn-ghost"),
		formValues: () => container.querySelector("pre")?.textContent,
	};
};

const autocompletes = (inputs: HTMLInputElement[]) => inputs.map((i) => i.getAttribute("autocomplete"));
const names = (inputs: HTMLInputElement[]) => inputs.map((i) => i.getAttribute("name"));

describe("BasicAuthFields", () => {
	it("marks the empty password field as new-password so it is not autofilled", () => {
		const { passwords } = renderFields();
		expect(autocompletes(passwords)).toEqual(["new-password"]);
	});

	it("marks the empty username field as new-password so it is not autofilled", () => {
		const { usernames } = renderFields();
		expect(autocompletes(usernames)).toEqual(["new-password"]);
	});

	it("gives the empty row username a name that is not a credential name", () => {
		const { usernames } = renderFields();
		expect(names(usernames)).toEqual(["items-username-0"]);
	});

	it("gives the empty row password a name that is not a credential name", () => {
		const { passwords } = renderFields();
		expect(names(passwords)).toEqual(["items-password-0"]);
	});

	it("marks the usernames of existing rows as new-password too", () => {
		const { usernames } = renderFields([
			{ username: "one", password: "" },
			{ username: "two", password: "" },
		]);
		expect(autocompletes(usernames)).toEqual(["new-password", "new-password"]);
	});

	it("marks the passwords of existing rows as new-password too", () => {
		const { passwords } = renderFields([
			{ username: "one", password: "" },
			{ username: "two", password: "" },
		]);
		expect(autocompletes(passwords)).toEqual(["new-password", "new-password"]);
	});

	it("gives every row a distinct name", () => {
		const { usernames, passwords } = renderFields([
			{ username: "one", password: "" },
			{ username: "two", password: "" },
		]);
		expect(names([...usernames, ...passwords])).toEqual([
			"items-username-0",
			"items-username-1",
			"items-password-0",
			"items-password-1",
		]);
	});

	it("namespaces the username name by the form field name", () => {
		const { usernames } = renderFields([], "auth");
		expect(names(usernames)).toEqual(["auth-username-0"]);
	});

	it("namespaces the password name by the form field name", () => {
		const { passwords } = renderFields([], "auth");
		expect(names(passwords)).toEqual(["auth-password-0"]);
	});

	it("still names the inputs when an empty form field name is passed", () => {
		// "" is falsy but is not undefined, so the name = "items" default does
		// not apply. The names stay non-credential either way.
		const { usernames, passwords } = renderFields([], "");
		expect(names([...usernames, ...passwords])).toEqual(["-username-0", "-password-0"]);
	});

	it("names a row added after the first render with the next index", () => {
		const view = renderInteractive([{ username: "one", password: "" }]);
		fireEvent.click(view.addButton());
		expect(names([...view.usernames(), ...view.passwords()])).toEqual([
			"items-username-0",
			"items-username-1",
			"items-password-0",
			"items-password-1",
		]);
	});

	it("marks a row added after the first render as new-password", () => {
		const view = renderInteractive([{ username: "one", password: "" }]);
		fireEvent.click(view.addButton());
		expect(autocompletes([...view.usernames(), ...view.passwords()])).toEqual([
			"new-password",
			"new-password",
			"new-password",
			"new-password",
		]);
	});

	it("renumbers the remaining row when an earlier row is removed", () => {
		const view = renderInteractive([
			{ username: "one", password: "" },
			{ username: "two", password: "" },
		]);
		fireEvent.click(view.removeButtons()[0]);
		expect(names([...view.usernames(), ...view.passwords()])).toEqual(["items-username-0", "items-password-0"]);
	});

	it("keeps the attributes on a row that has been typed into", () => {
		const view = renderInteractive();
		fireEvent.change(view.usernames()[0], { target: { value: "typed" } });
		const input = view.usernames()[0];
		expect([input.getAttribute("name"), input.getAttribute("autocomplete")]).toEqual([
			"items-username-0",
			"new-password",
		]);
	});

	it("still renders the existing username (control)", () => {
		const { usernames } = renderFields([{ username: "one", password: "" }]);
		expect(usernames[0].value).toEqual("one");
	});

	it("still renders the saved-password placeholder for an existing row (control)", () => {
		const { passwords } = renderFields([{ username: "one", password: "" }]);
		expect(passwords[0].getAttribute("placeholder")).toEqual("••••••••");
	});

	it("leaves the placeholder empty on a row with no saved password (control)", () => {
		const { passwords } = renderFields();
		expect(passwords[0].getAttribute("placeholder")).toEqual("");
	});

	it("keeps the submitted items shape when a row is typed into (control)", async () => {
		// The DOM name attribute must not reach Formik: the component writes
		// through the name *prop* via setFieldValue, so the payload is the
		// items array, never an "items-username-0" key.
		const view = renderInteractive();
		fireEvent.change(view.usernames()[0], { target: { value: "typed" } });
		fireEvent.change(view.passwords()[0], { target: { value: "secret" } });
		await waitFor(() => {
			expect(view.formValues()).toEqual(JSON.stringify({ items: [{ username: "typed", password: "secret" }] }));
		});
	});
});
