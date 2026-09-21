import { render } from "@testing-library/react";
import { Form, Formik } from "formik";
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

	it("gives the empty row inputs names that are not credential names", () => {
		const { usernames, passwords } = renderFields();
		expect(names(usernames)).toEqual(["items-username-0"]);
		expect(names(passwords)).toEqual(["items-password-0"]);
	});

	it("marks existing rows as new-password too", () => {
		const { usernames, passwords } = renderFields([
			{ username: "one", password: "" },
			{ username: "two", password: "" },
		]);
		expect(autocompletes(usernames)).toEqual(["new-password", "new-password"]);
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

	it("namespaces the names by the form field name", () => {
		const { usernames, passwords } = renderFields([], "auth");
		expect(names(usernames)).toEqual(["auth-username-0"]);
		expect(names(passwords)).toEqual(["auth-password-0"]);
	});

	it("still renders the existing username and the saved-password placeholder (control)", () => {
		const { usernames, passwords } = renderFields([{ username: "one", password: "" }]);
		expect(usernames[0].value).toEqual("one");
		expect(passwords[0].getAttribute("placeholder")).toEqual("••••••••");
	});
});
