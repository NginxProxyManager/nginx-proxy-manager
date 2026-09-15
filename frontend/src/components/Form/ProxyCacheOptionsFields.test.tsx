import { fireEvent, render, waitFor } from "@testing-library/react";
import { Form, Formik } from "formik";
import { describe, expect, it } from "vitest";
import { ProxyCacheOptionsFields } from "./ProxyCacheOptionsFields";

const renderFields = (overrides = {}) =>
	render(
		<Formik
			initialValues={{
				assetCacheTtl: 1800,
				cachingEnabled: false,
				...overrides,
			}}
			onSubmit={() => undefined}
		>
			<Form>
				<ProxyCacheOptionsFields color="bg-lime" />
			</Form>
		</Formik>,
	);

describe("ProxyCacheOptionsFields", () => {
	it("shows the cache lifetime only while asset caching is enabled", async () => {
		renderFields();

		expect(document.getElementById("assetCacheTtl")).toBeNull();
		fireEvent.click(document.getElementById("cachingEnabled") as HTMLElement);

		await waitFor(() => {
			expect(document.getElementById("assetCacheTtl")).not.toBeNull();
		});

		fireEvent.click(document.getElementById("cachingEnabled") as HTMLElement);
		await waitFor(() => {
			expect(document.getElementById("assetCacheTtl")).toBeNull();
		});
	});
});
