import { render } from "@testing-library/react";
import { Form, Formik } from "formik";
import { BasicAuthFields } from "src/components";
import { describe, expect, it } from "vitest";

describe("BasicAuthFields", () => {
	it("names the inputs and stops browsers autofilling them", () => {
		const { container } = render(
			<Formik initialValues={{ items: [] }} onSubmit={() => {}}>
				<Form>
					<BasicAuthFields initialValues={[]} />
				</Form>
			</Formik>,
		);
		const inputs = Array.from(container.querySelectorAll("input"));

		expect(inputs.map((input) => input.getAttribute("name"))).toEqual(["items-username-0", "items-password-0"]);
		expect(inputs.map((input) => input.getAttribute("autocomplete"))).toEqual(["new-password", "new-password"]);
	});
});
