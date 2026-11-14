import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Formik } from "formik";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SSLCertificateField } from "./SSLCertificateField";

vi.mock("src/context", () => ({ useLocaleState: () => ({ locale: "en" }) }));
vi.mock("src/hooks", () => ({
	useCertificates: () => ({
		isLoading: false,
		isError: false,
		data: [{ id: 3, niceName: "app.example.com", provider: "other", expiresOn: null }],
	}),
}));

afterEach(cleanup);

type Values = { certificateId: number | "new"; http2Support: boolean };

const renderField = (initial: Values, http2OnCertificate?: boolean) => {
	const values: { current: Values } = { current: initial };
	render(
		<Formik initialValues={initial} onSubmit={() => {}}>
			{(f) => {
				values.current = f.values;
				return <SSLCertificateField allowNew http2OnCertificate={http2OnCertificate} />;
			}}
		</Formik>,
	);
	return values;
};

const pick = async (label: RegExp) => {
	fireEvent.mouseDown(document.querySelector(".react-select__control") as HTMLElement, { button: 0 });
	fireEvent.click(await screen.findByText(label));
};

describe("SSLCertificateField: HTTP/2 from a Docker label", () => {
	it("turns HTTP/2 on when the first certificate is picked", async () => {
		const values = renderField({ certificateId: 0, http2Support: false }, true);
		await pick(/app\.example\.com/);
		expect(values.current).toEqual({ certificateId: 3, http2Support: true });
		// and off again with the certificate
		await pick(/^None$|certificate\.none\.title/);
		expect(values.current).toEqual({ certificateId: 0, http2Support: false });
	});

	it("also for a certificate that is requested on save", async () => {
		const values = renderField({ certificateId: 0, http2Support: false }, true);
		await pick(/Request a new|certificates\.request\.title/);
		expect(values.current.http2Support).toBe(true);
	});

	it("leaves HTTP/2 alone without the label", async () => {
		const values = renderField({ certificateId: 0, http2Support: false });
		await pick(/app\.example\.com/);
		expect(values.current).toEqual({ certificateId: 3, http2Support: false });
	});
});
