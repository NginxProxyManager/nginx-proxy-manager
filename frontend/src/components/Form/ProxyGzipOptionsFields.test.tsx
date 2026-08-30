import { fireEvent, render, waitFor } from "@testing-library/react";
import { Form, Formik } from "formik";
import { describe, expect, it } from "vitest";
import { ProxyGzipOptionsFields } from "./ProxyGzipOptionsFields";

const renderFields = (overrides = {}) =>
	render(
		<Formik
			initialValues={{
				gzipCompLevel: 1,
				gzipEnabled: false,
				gzipTypes: [],
				...overrides,
			}}
			onSubmit={() => undefined}
		>
			<Form>
				<ProxyGzipOptionsFields color="bg-lime" />
			</Form>
		</Formik>,
	);

describe("ProxyGzipOptionsFields", () => {
	it("shows gzip level and MIME types only while gzip is enabled", async () => {
		renderFields();

		expect(document.getElementById("gzipCompLevel")).toBeNull();
		expect(document.getElementById("gzipTypes")).toBeNull();
		fireEvent.click(document.getElementById("gzipEnabled") as HTMLElement);

		await waitFor(() => {
			expect(document.getElementById("gzipCompLevel")).not.toBeNull();
			expect(document.getElementById("gzipTypes")).not.toBeNull();
		});

		fireEvent.click(document.getElementById("gzipEnabled") as HTMLElement);
		await waitFor(() => {
			expect(document.getElementById("gzipCompLevel")).toBeNull();
			expect(document.getElementById("gzipTypes")).toBeNull();
		});
	});

	it("aligns the gzip controls and renders their help across the full row", () => {
		renderFields({ gzipEnabled: true });

		const controlsRow = document.getElementById("gzipCompLevel")?.closest(".row");
		const help = document.querySelector(".form-hint");

		expect(controlsRow?.classList.contains("align-items-end")).toBe(true);
		expect(help?.previousElementSibling).toBe(controlsRow);
		expect(help?.closest(".col-md-9")).toBeNull();
	});
});
