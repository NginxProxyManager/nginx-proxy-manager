import { fireEvent, render, waitFor } from "@testing-library/react";
import { Form, Formik } from "formik";
import { describe, expect, it } from "vitest";
import { ProxyPerformanceOptionsFields } from "./ProxyPerformanceOptionsFields";

const renderFields = (overrides = {}) =>
	render(
		<Formik
			initialValues={{
				assetCacheTtl: 1800,
				cachingEnabled: false,
				gzipCompLevel: 1,
				gzipEnabled: false,
				gzipTypes: [],
				...overrides,
			}}
			onSubmit={() => undefined}
		>
			<Form>
				<ProxyPerformanceOptionsFields color="bg-lime" />
			</Form>
		</Formik>,
	);

describe("ProxyPerformanceOptionsFields", () => {
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
});
